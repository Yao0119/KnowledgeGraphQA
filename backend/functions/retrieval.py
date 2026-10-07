"""
知识图谱检索模块

背景（为什么需要这个模块）
--------------------------
原实现（backend/functions/agent.py 的 extract_keyword）只取问题的**第一个空白分词**
当作关键词，然后拿它去和节点名做 `CONTAINS` 子串匹配：

    cleaned = re.sub(r"[^a-zA-Z0-9\\u4e00-\\u9fff]", " ", question)
    return cleaned.strip().split()[0]      # 中文问句没有空格 → 整句变成一个"关键词"

于是"恶意软件如何传播？"会被当成**一整个关键词**去匹配节点名，
而图谱里不可能存在恰好等于这句话的节点名 → 恒定 0 命中，
问答功能实际退化成了"不看图谱、直接问 LLM"。reasoning.py 里有同样的写法。

本模块的策略（两阶段，先精确后兜底）
------------------------------------
阶段 A（实体命中，默认路径）
    把图谱中已有的节点名缓存起来，找出**字面出现在问题里**的节点名
    （例如问题含"恶意软件"，图谱里正好有名为"恶意软件"的节点）。
    这是最精确的匹配方式，且与时序无关。命中后取这些节点关联的三元组。

阶段 B（关键词兜底）
    阶段 A 无命中时，退化为中文 n-gram（2/3/4 字）+ 英文词的关键词集合，
    用 `any(t IN $terms WHERE name CONTAINS t)` 做召回，并按命中词数排序。
    这一步用来处理"问题用词与节点名不完全一致"的情况。

两阶段都拿不到三元组时，返回空证据，由上层提示"知识图谱中暂无相关信息"。
"""

import re
import threading
import time
from typing import Any, Dict, List, Optional

from ..core.config import (
    KG_EXPAND_NEIGHBORS,
    KG_MAX_TERMS,
    KG_MAX_TRIPLES,
)
from ..utils.neo4j_utils import get_neo4j_driver

# ========================================
# 词法资源
# ========================================

# 中文功能词 / 疑问词：作为 n-gram 出现时几乎不携带领域信息，必须过滤
_ZH_STOPWORDS = {
    "如何", "什么", "怎么", "怎样", "哪些", "哪个", "哪里", "为何", "为什么",
    "是否", "能否", "可以", "请问", "介绍", "解释", "说明", "一下", "相关",
    "关于", "以及", "或者", "还是", "这些", "那些", "这个", "那个", "一个",
    "一些", "可能", "需要", "进行", "通过", "由于", "因此", "所以", "但是",
    "而且", "如果", "那么", "我们", "你们", "他们", "告诉", "知道", "了解",
    "多少", "几个", "区别", "关系", "作用", "影响", "方法", "方式", "情况",
    "问题", "方面", "时候", "现在", "目前", "主要", "重要", "常见", "一般",
    "通常", "比如", "例如", "包括", "属于", "具有", "能够", "应该", "必须",
    "已经", "正在", "将要", "有没有", "是不是", "能不能", "有哪些", "是什么",
}

# 英文停用词（避免把 what / how / the 之类当成图谱关键词）
_EN_STOPWORDS = {
    "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
    "is", "are", "was", "were", "be", "been", "being", "do", "does", "did",
    "have", "has", "had", "a", "an", "the", "and", "or", "but", "if", "then",
    "than", "that", "this", "these", "those", "of", "in", "on", "at", "to",
    "for", "with", "by", "from", "as", "it", "its", "can", "could", "should",
    "would", "will", "shall", "may", "might", "must", "about", "into", "over",
    "after", "before", "between", "during", "please", "tell", "me", "explain",
    "describe", "introduce", "list", "give", "show", "many", "much", "more",
    "most", "some", "any", "all", "no", "not", "only", "also", "such", "other",
    "another", "use", "used", "using", "difference", "related", "relationship",
}

_CJK_RUN_RE = re.compile(r"[\u4e00-\u9fff]+")
_EN_TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9._+\-]{1,}")

# 单个候选词的最大长度，超过基本不可能是图谱实体名
_MAX_TERM_LEN = 8

# 疑问/衔接类短语。生成 n-gram 之前先把这些短语从中文串里切掉，
# 否则会产生 "什么是勒"、"件如何传" 这类跨越功能词的垃圾候选；
# 同时也能保住句尾的真正实体（例如 "恶意软件如何传播" 切完是 ["恶意软件","传播"]）。
#
# 注意：这里**只**收录疑问与衔接性短语，以及极不可能出现在领域术语内部的虚词。
# 刻意不收录 为/有/在/是/关系/方式 等字词 —— 它们可能是真实术语的一部分
# （行为、有效载荷、存在、关系型数据库、传播方式…），切掉反而丢信息。
_ZH_SPLIT_PHRASES = sorted({
    # 疑问/指代
    "什么是", "什么叫", "是什么", "有什么", "有什么关系", "有何关系", "有哪些",
    "哪些", "哪个", "哪里", "为什么", "为何", "怎么样", "怎样", "怎么", "什么",
    "如何", "多少", "几个", "是否", "有没有", "是不是", "能不能", "会不会",
    # 衔接/礼貌
    "请问", "介绍", "解释", "说明", "一下", "以及", "或者", "还是", "关于", "相关",
    # 虚词（单字）
    "的", "了", "吗", "呢", "和", "与", "及", "或", "把", "被",
}, key=len, reverse=True)


def _segment_cjk(run: str) -> List[str]:
    """
    把一段连续中文按疑问/衔接短语切成若干实义片段

    Args:
        run: 连续中文字符串

    Returns:
        list: 长度不小于 2 的片段

    Example:
        >>> _segment_cjk("恶意软件如何传播")
        ['恶意软件', '传播']
    """
    segments = [run]
    for phrase in _ZH_SPLIT_PHRASES:
        if not any(phrase in seg for seg in segments):
            continue
        expanded: List[str] = []
        for seg in segments:
            expanded.extend(seg.split(phrase))
        segments = expanded
    return [seg for seg in segments if len(seg) >= 2]


# ========================================
# 关键词抽取（阶段 B）
# ========================================

def _ngrams(run: str, sizes=(4, 3, 2)) -> List[str]:
    """
    为一个中文连续串生成候选 n-gram

    按 n 从大到小、同 n 内按位置顺序产出，因此长词（更具体）优先，
    同时保证整句各位置都有覆盖，不会只截取句子开头。

    Args:
        run: 连续中文字符串
        sizes: 需要生成的 n 值

    Returns:
        list: 候选词列表（未去重、未过滤停用词）
    """
    out: List[str] = []
    length = len(run)
    for n in sizes:
        if n > length:
            continue
        for i in range(length - n + 1):
            out.append(run[i:i + n])
    return out


def _strided(items: List[str], k: int) -> List[str]:
    """
    从列表中均匀取样 k 项

    用于长问句的候选词限流：直接取前 k 个会让后面的内容完全参与不了匹配，
    等距取样可以覆盖整句。

    Args:
        items: 待取样列表（已去重）
        k: 取多少个

    Returns:
        list: 取样结果（保持原有相对顺序）
    """
    n = len(items)
    if n <= k:
        return list(items)
    if k <= 1:
        return items[:1]
    step = (n - 1) / (k - 1)
    indexes = sorted({int(round(i * step)) for i in range(k)})
    return [items[i] for i in indexes]


def extract_terms(question: str, max_terms: int = KG_MAX_TERMS) -> List[str]:
    """
    从自然语言问题中抽取用于图谱召回的关键词

    生成策略：
      1. 英文/数字标识（如 trojan.generic、cve-2024）原样保留；
      2. 中文先按疑问/衔接短语切段，再在**段内**生成 2/3/4 字 n-gram，
         避免跨功能词产生垃圾候选；
      3. 按长度配额分配名额（长实体优先，2 字词保证召回），超配额时等距采样。

    Args:
        question: 用户问题
        max_terms: 最多返回多少个候选词

    Returns:
        list: 候选关键词（已去重、已过滤停用词）

    Example:
        >>> extract_terms("恶意软件如何传播？")
        ['恶意软件', '传播', '恶意软', '意软件', '恶意', '意软', '软件']
    """
    if not question or not isinstance(question, str):
        return []

    text = question.lower()
    candidates: List[str] = []

    # 英文 / 数字标识（例如 "trojan.generic"、"cve-2024"）
    for token in _EN_TOKEN_RE.findall(text):
        if token in _EN_STOPWORDS or len(token) < 2:
            continue
        candidates.append(token)

    # 中文：切段后生成段内 n-gram
    for run in _CJK_RUN_RE.findall(text):
        for segment in _segment_cjk(run):
            for gram in _ngrams(segment):
                if gram in _ZH_STOPWORDS or len(gram) > _MAX_TERM_LEN:
                    continue
                candidates.append(gram)

    if not candidates:
        return []

    # 去重（保持首次出现顺序）
    seen = set()
    unique: List[str] = []
    for term in candidates:
        if term in seen:
            continue
        seen.add(term)
        unique.append(term)

    # 按长度分桶
    by_len: Dict[int, List[str]] = {}
    for term in unique:
        by_len.setdefault(len(term), []).append(term)

    # 长度配额：长词（>=5）最具体，优先占位；2 字词保证召回；3/4 字词兼顾两者
    quotas = {2: 0.40, 3: 0.25, 4: 0.15}
    selected: List[str] = []

    # 1) 长度 >= 5 的整词：几乎可以确定是实体名
    for length in sorted(l for l in by_len if l >= 5):
        selected.extend(by_len[length])
    selected = selected[:max(1, int(max_terms * 0.2))]

    # 2) 2/3/4 字 n-gram 按配额取样
    for length in (2, 3, 4):
        bucket = by_len.get(length, [])
        if not bucket:
            continue
        quota = max(1, int(round(max_terms * quotas[length])))
        selected.extend(_strided(bucket, quota))

    # 3) 仍有空位时，用剩余的长词补齐（长词更具体）
    if len(selected) < max_terms:
        chosen = set(selected)
        leftovers: List[str] = []
        for length in sorted(by_len.keys(), reverse=True):
            leftovers.extend(t for t in by_len[length] if t not in chosen)
        selected.extend(_strided(leftovers, max_terms - len(selected)))

    # 最终去重 + 截断
    final: List[str] = []
    seen_final = set()
    for term in selected:
        if term in seen_final:
            continue
        seen_final.add(term)
        final.append(term)

    return final[:max_terms]


# ========================================
# 图谱实体名缓存（阶段 A）
# ========================================

_entity_cache: Dict[str, Any] = {"names": [], "expires_at": 0.0}
_entity_lock = threading.Lock()
_ENTITY_TTL_SECONDS = 300
_ENTITY_MAX_NAMES = 20000


def get_node_names(force_refresh: bool = False) -> List[str]:
    """
    获取图谱中的节点名列表（进程内缓存，默认 5 分钟）

    节点名集合变动很少，而"用问题去匹配实体名"需要全量名字，
    因此这里做一层带 TTL 的缓存，避免每次提问都全表扫描。

    Args:
        force_refresh: 忽略缓存强制刷新

    Returns:
        list: 节点名列表（失败时返回空列表）
    """
    now = time.time()
    with _entity_lock:
        if not force_refresh and _entity_cache["names"] and now < _entity_cache["expires_at"]:
            return list(_entity_cache["names"])

    try:
        driver = get_neo4j_driver()
        with driver.session() as session:
            # 为什么要排除 :Solution / :Behavior / :Description / :DateValue / :CountValue：
            #   当前图谱把「解决方案 / 病毒行为 / 综合描述」三段文本也做成了节点，
            #   它们占了全部节点的 ~72%（122 万 / 170 万），节点名就是整句中文。
            #   而这里用的是无序 `MATCH (n) ... LIMIT`，扫描到的基本都是这些句子，
            #   20,000 个名额会被它们吃掉 —— 实测前 25 个名字里有 15 个是整句话。
            #   结果"实体命中"阶段能覆盖的病毒数从数千掉到约 1500，答案质量明显下降。
            #   这些句子也几乎不可能字面出现在用户提问里，排除掉没有任何损失。
            #   同理排除日期/计数节点：名字是 "0"、"2025-08" 这类纯值，
            #   拿去做子串匹配只会产生误命中。
            # 由此空出的额度会全部让给真正有检索价值的实体名
            #   （Malware / Family / Platform / Alias / Category / MalwareType）。
            # 如果还想进一步扩大覆盖，可以调大环境变量 KG_ENTITY_MAX_NAMES 对应的
            #   _ENTITY_MAX_NAMES（默认 20000）：名字都很短，放宽到 10 万量级内存代价很小。
            records = session.run(
                "MATCH (n) WHERE n.name IS NOT NULL "
                "AND NOT (n:Solution OR n:Behavior OR n:Description "
                "OR n:DateValue OR n:CountValue) "
                "RETURN DISTINCT toString(n.name) AS name LIMIT $limit",
                limit=_ENTITY_MAX_NAMES,
            )
            names = [rec["name"] for rec in records if rec["name"]]
    except Exception as exc:
        print(f"⚠️ 获取图谱节点名失败: {exc}")
        return []

    with _entity_lock:
        _entity_cache["names"] = names
        _entity_cache["expires_at"] = now + _ENTITY_TTL_SECONDS
    return list(names)


def invalidate_entity_cache() -> None:
    """
    使实体名缓存失效（图谱写操作后应调用）
    """
    with _entity_lock:
        _entity_cache["names"] = []
        _entity_cache["expires_at"] = 0.0


def match_entity_names(
    question: str,
    names: Optional[List[str]] = None,
    max_hits: int = 20,
) -> List[str]:
    """
    找出字面出现在问题中的图谱实体名

    Args:
        question: 用户问题
        names: 候选实体名；为 None 时自动读取（带缓存）
        max_hits: 最多返回多少个实体

    Returns:
        list: 命中的实体名，长名优先（更具体）

    Example:
        >>> match_entity_names("恶意软件如何传播？", ["恶意软件", "传播", "漏洞"])
        ['恶意软件', '传播']
    """
    if not question:
        return []

    pool = names if names is not None else get_node_names()
    if not pool:
        return []

    text = question.lower()
    hits: List[str] = []
    seen = set()
    for name in pool:
        if not name or not isinstance(name, str):
            continue
        key = name.strip().lower()
        # 单字名噪音过大，直接跳过
        if len(key) < 2 or key in seen:
            continue
        if key in text:
            seen.add(key)
            hits.append(name.strip())

    hits.sort(key=len, reverse=True)
    return hits[:max_hits]


# ========================================
# Cypher 查询
# ========================================

def _incident_pattern(expand: bool) -> str:
    """
    返回关系匹配模式

    Args:
        expand: True 表示不限方向（等价于取实体的全部关联关系，即 1 跳邻居扩展）

    Returns:
        str: Cypher 模式片段
    """
    return "(n)-[r]-(m)" if expand else "(n)-[r]->(m)"


_TRIPLE_PROJECTION = """
    coalesce(startNode(r).name, elementId(startNode(r))) AS source,
    type(r) AS relation,
    coalesce(endNode(r).name, elementId(endNode(r))) AS target,
    elementId(startNode(r)) AS sid,
    elementId(endNode(r)) AS tid
"""


def _run(query: str, **params) -> List[Any]:
    """
    执行 Cypher

    Args:
        query: 语句
        **params: 参数

    Returns:
        list: 记录列表（失败时返回空列表并打印原因）
    """
    try:
        driver = get_neo4j_driver()
        with driver.session() as session:
            return list(session.run(query, **params))
    except Exception as exc:
        print(f"⚠️ 图谱检索失败: {exc}")
        return []


def fetch_triples_by_entities(
    entities: List[str],
    limit: int = KG_MAX_TRIPLES,
    expand: bool = KG_EXPAND_NEIGHBORS,
) -> List[Dict[str, Any]]:
    """
    阶段 A：按实体名精确取关联三元组

    Args:
        entities: 命中问题的实体名
        limit: 返回三元组上限
        expand: 是否取全部关联关系（含入边）

    Returns:
        list: 三元组字典列表
    """
    if not entities:
        return []

    query = f"""
    MATCH {_incident_pattern(expand)}
    WHERE toString(n.name) IN $names
    WITH DISTINCT r
    RETURN {_TRIPLE_PROJECTION}
    LIMIT $limit
    """
    records = _run(query, names=entities, limit=limit)
    return [_to_triple(rec) for rec in records]


def fetch_triples_by_terms(
    terms: List[str],
    limit: int = KG_MAX_TRIPLES,
    expand: bool = KG_EXPAND_NEIGHBORS,
) -> List[Dict[str, Any]]:
    """
    阶段 B：按关键词做子串召回，并按命中关键词数量排序

    Args:
        terms: 候选关键词
        limit: 返回三元组上限
        expand: 是否取全部关联关系（含入边）

    Returns:
        list: 三元组字典列表
    """
    if not terms:
        return []

    # 注意：关键词一律通过参数传递（$terms），不拼进语句，避免 Cypher 注入。
    # 打分用 startNode/endNode 而不是 n/m —— 因为 (n)-[r]-(m) 对同一条关系会产出
    # 两个方向的记录，若用 n/m 打分会在 DISTINCT 后留下重复的三元组。
    query = f"""
    MATCH {_incident_pattern(expand)}
    WHERE any(t IN $terms WHERE
              toLower(toString(coalesce(n.name, ''))) CONTAINS toLower(t)
           OR toLower(toString(coalesce(m.name, ''))) CONTAINS toLower(t))
    WITH DISTINCT r
    WITH r, size([t IN $terms WHERE
                    toLower(toString(coalesce(startNode(r).name, ''))) CONTAINS toLower(t)
                 OR toLower(toString(coalesce(endNode(r).name, ''))) CONTAINS toLower(t)]) AS score
    RETURN {_TRIPLE_PROJECTION}, score
    ORDER BY score DESC
    LIMIT $limit
    """
    records = _run(query, terms=terms, limit=limit)
    triples = []
    for rec in records:
        triple = _to_triple(rec)
        triple["score"] = rec.get("score", 0)
        triples.append(triple)
    return triples


def _to_triple(record) -> Dict[str, Any]:
    """
    把 Neo4j 记录转换为三元组字典

    Args:
        record: Neo4j 记录

    Returns:
        dict: {"source", "relation", "target", "sid", "tid"}
    """
    return {
        "source": record["source"],
        "relation": record["relation"],
        "target": record["target"],
        "sid": record["sid"],
        "tid": record["tid"],
    }


def build_evidence(triples: List[Dict[str, Any]]) -> str:
    """
    把三元组列表渲染为提示词中的证据文本

    Args:
        triples: 三元组列表

    Returns:
        str: 每行一条 "(源) -[关系]-> (目标)"
    """
    if not triples:
        return ""
    return "\n".join(
        f"({t['source']}) -[{t['relation']}]-> ({t['target']})"
        for t in triples
    )


# ========================================
# 对外入口
# ========================================

def retrieve_for_question(
    question: str,
    limit: int = KG_MAX_TRIPLES,
    max_terms: int = KG_MAX_TERMS,
    expand: bool = KG_EXPAND_NEIGHBORS,
) -> Dict[str, Any]:
    """
    为问题检索知识图谱证据（两阶段）

    Args:
        question: 用户问题
        limit: 三元组数量上限
        max_terms: 关键词数量上限
        expand: 是否做 1 跳邻居扩展

    Returns:
        dict: {
            "strategy": "entity-match" | "term-match" | "no-match",
            "entities": [命中的实体名],
            "terms":    [阶段 B 使用的关键词],
            "triples":  [{source, relation, target, sid, tid}],
            "evidence": "证据文本",
            "used_nodes": [涉及节点的 elementId],
        }
    """
    result: Dict[str, Any] = {
        "strategy": "no-match",
        "entities": [],
        "terms": [],
        "triples": [],
        "evidence": "",
        "used_nodes": [],
    }

    if not question or not isinstance(question, str):
        return result

    # ---- 阶段 A：实体字面命中 ----
    entities = match_entity_names(question)
    if entities:
        triples = fetch_triples_by_entities(entities, limit=limit, expand=expand)
        if triples:
            result["strategy"] = "entity-match"
            result["entities"] = entities
            result["triples"] = triples
            result["evidence"] = build_evidence(triples)
            result["used_nodes"] = _collect_node_ids(triples)
            return result

    # ---- 阶段 B：关键词兜底 ----
    terms = extract_terms(question, max_terms=max_terms)
    if terms:
        triples = fetch_triples_by_terms(terms, limit=limit, expand=expand)
        result["terms"] = terms
        if triples:
            result["strategy"] = "term-match"
            result["triples"] = triples
            result["evidence"] = build_evidence(triples)
            result["used_nodes"] = _collect_node_ids(triples)
            return result

    # 两阶段都空：保留阶段 A 的实体命中结果（可能实体命中但该节点没有关系）
    if entities:
        result["entities"] = entities

    return result


def _collect_node_ids(triples: List[Dict[str, Any]]) -> List[str]:
    """
    收集三元组涉及的所有节点 id

    Args:
        triples: 三元组列表

    Returns:
        list: 去重后的 elementId 列表
    """
    ids: List[str] = []
    seen = set()
    for triple in triples:
        for key in ("sid", "tid"):
            value = triple.get(key)
            if value and value not in seen:
                seen.add(value)
                ids.append(value)
    return ids
