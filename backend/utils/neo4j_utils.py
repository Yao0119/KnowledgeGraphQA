"""
Neo4j 数据库工具模块
提供与Neo4j知识图谱的交互功能
"""

from neo4j import GraphDatabase
from typing import Dict, List, Any, Optional
from ..core.config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# ========================================
# 节点展示辅助
# ========================================

def node_display_name(node) -> str:
    """
    安全地取出节点的展示名

    依次尝试 name / title / 第一个标签 / elementId，避免无标签节点触发 IndexError。

    Args:
        node: neo4j Node 对象

    Returns:
        str: 用于展示的节点名称
    """
    for key in ("name", "title"):
        value = node.get(key)
        if value:
            return str(value)
    labels = list(node.labels)
    if labels:
        return labels[0]
    return node.element_id


# 公共标签：所有节点都带，不能拿来当"类型"展示
_COMMON_LABELS = {"Entity"}

# 恶意软件家族标签（:Malware 节点会额外带其中一个，用它配色比 "Malware" 更有信息量）
_MALWARE_FAMILIES = ("Virus", "Trojan", "Worm", "GrayWare", "RiskWare",
                     "HackTool", "TestFile", "JunkFile")

# 领域标签优先级（不含家族标签）
_DOMAIN_LABELS = ("Family", "Platform", "Alias", "Category", "Solution",
                  "Behavior", "Description", "DateValue", "CountValue",
                  "MalwareType", "Malware", "Attribute")


def node_display_type(node) -> str:
    """
    安全地取出节点的类型

    为什么不能直接取 labels[0]：
        当前图谱 schema 里**每个节点都带 :Entity 公共标签**（作为统一约束/索引的载体），
        :Malware 节点还会额外带家族标签。而 Neo4j 的 labels() 返回顺序并不保证，
        实测 `labels(n)[0]` 对 :Solution / :Family / :Platform 等节点会返回 "Entity"，
        导致前端所有节点类型都变成 "Entity"、配色与分组全部失效。

    因此这里先剔除公共标签，再按"家族 → 领域"的优先级挑一个最有信息量的标签。

    Args:
        node: neo4j Node 对象

    Returns:
        str: 家族标签（Virus/Trojan/...）或领域标签（Family/Platform/...）；
             都没有时返回 "Node"
    """
    labels = set(node.labels) - _COMMON_LABELS
    for family in _MALWARE_FAMILIES:
        if family in labels:
            return family
    for domain in _DOMAIN_LABELS:
        if domain in labels:
            return domain
    if labels:
        return sorted(labels)[0]
    return "Node"


def node_payload(node) -> Dict[str, Any]:
    """
    把 Neo4j 节点转成前端需要的精简结构

    Args:
        node: neo4j Node 对象

    Returns:
        dict: id / label（展示名）/ type（配色用）/ lang / name_orig / is_core
    """
    return {
        "id": node.element_id,
        # 中文层节点在导入时已把 name 换成了中文名（如 "Excel 文档"），
        # name_orig 永远是源数据原值（如 "MSExcel"），用它做跨层对应
        "label": node_display_name(node),
        "type": node_display_type(node),
        "lang": node.get("lang"),
        "name_orig": node.get("name_orig") or node.get("name"),
        # norm_name 上有索引（entity_norm_name），是查"同一个实体的中英两版"的唯一高效入口；
        # 用 name/name_orig 查都会退化成 170 万节点全表扫描。
        "norm_name": node.get("norm_name"),
        # 核心节点 = 恶意软件本体（中英两层只有它之间存在 ALIGN_WITH 映射）
        "is_core": "Malware" in node.labels,
    }


# ========================================
# Neo4j 驱动初始化（延迟初始化）
# ========================================

_driver = None


def get_neo4j_driver():
    """
    获取Neo4j驱动实例（延迟初始化）
    
    Returns:
        Driver: Neo4j驱动对象
        
    Raises:
        Exception: 如果连接失败
    """
    global _driver
    if _driver is None:
        try:
            _driver = GraphDatabase.driver(
                NEO4J_URI,
                auth=(NEO4J_USER, NEO4J_PASSWORD),
                connection_timeout=5  # 5秒连接超时
            )
            # 验证连接
            with _driver.session() as session:
                session.run("RETURN 1")
        except Exception as e:
            print(f"⚠️ Neo4j 驱动初始化失败: {e}")
            _driver = None
            raise
    return _driver


# ========================================
# 图谱查询函数
# ========================================

def get_graph_summary() -> Dict[str, int]:
    """
    获取图谱统计信息
    统计节点和关系的总数
    
    Returns:
        dict: 包含nodes（节点数）和relationships（关系数）的字典
    """
    try:
        driver = get_neo4j_driver()
        with driver.session() as session:
            node_count = session.run("MATCH (n) RETURN count(n) AS c").single()["c"]
            rel_count = session.run("MATCH ()-[r]->() RETURN count(r) AS c").single()["c"]
            return {"nodes": node_count, "relationships": rel_count}
    except Exception as e:
        print(f"⚠️ 获取图谱统计信息失败: {e}")
        return {"nodes": 0, "relationships": 0}


def get_sample_triples(limit: int = 20) -> Dict[str, List]:
    """
    获取随机三元组样本
    用于显示知识图谱的示例内容
    
    Args:
        limit: 返回的三元组数量
        
    Returns:
        dict: 包含data列表的字典，每个元素是一个三元组
    """
    try:
        driver = get_neo4j_driver()
        with driver.session() as session:
            result = session.run(
                """
                MATCH (a)-[r]->(b)
                RETURN a, r, b
                LIMIT $limit
                """,
                limit=limit
            )
            data = []
            for record in result:
                a = record["a"]
                b = record["b"]
                r = record["r"]
                data.append({
                    "source": {"name": node_display_name(a)},
                    "relation": r.type,
                    "target": {"name": node_display_name(b)},
                })
            return {"data": data}
    except Exception as e:
        print(f"⚠️ 获取样本三元组失败: {e}")
        return {"data": []}


def get_full_graph(
    limit: int = 800,
    seeds: int = 25,
    offset: int = 0,
    hide_text: bool = False,
) -> Dict[str, Any]:
    """
    取一个「可用于可视化」的子图样本（节点 + 边）

    ⚠️ 为什么不能再用原来的 `MATCH (n)-[r]->(m) RETURN n,r,m LIMIT $limit`：
        rels.csv 是**按关系类型分组**导入的（前 25 万行全是「威胁类型」），
        Neo4j 对这个模式会选择关系扫描，于是 LIMIT 200 取到的就是开头 200 条
        **同一种关系**。实测结果：207 个节点、关系种类 = 1 ——
        200 个病毒各自只挂一个类型节点，画出来是 200 个孤立小星形，
        用户看到的就是"实体怎么这么少"。

    改成**以恶意软件为种子展开邻域**后，样本立刻变得连通且多样：
        25 个种子 → 约 450 个节点 / 500 条边 / 11 种关系。

    Args:
        limit: 最多返回多少条关系
        seeds: 取多少个恶意软件作为种子（样本规模主要由它决定）
        offset: 种子偏移量，供前端"换一批"使用
        hide_text: 是否排除「解决方案/病毒行为/综合描述/首次发现时间/变种数量」节点。
                   这类节点名是整句中文（最长上百字），会把 vis-network 的层级/力导向
                   布局撑坏，默认不排除（先让用户看到全部），由页面开关控制。

    Returns:
        dict: {nodes, edges, meta:{seeds, offset, hide_text, seed_count,
              node_count, edge_count, total_malware}}
    """
    try:
        driver = get_neo4j_driver()
        with driver.session() as session:
            result = session.run(
                """
                MATCH (a:Malware)
                WITH a SKIP $offset LIMIT $seeds
                MATCH (a)-[r]->(b)
                WHERE $hide_text = false
                   OR NOT (b:Solution OR b:Behavior OR b:Description
                           OR b:DateValue OR b:CountValue)
                RETURN a, r, b
                LIMIT $limit
                """,
                offset=offset,
                seeds=seeds,
                limit=limit,
                hide_text=bool(hide_text),
            )

            nodes: Dict[str, Dict[str, Any]] = {}
            edges: List[Dict[str, Any]] = []
            seed_ids = set()

            for record in result:
                a = record["a"]
                r = record["r"]
                b = record["b"]

                # 统一用 node_payload，字段形状与 /api/graph/layers 保持一致
                # （id/label/type/lang/name_orig/norm_name/is_core）
                for node in (a, b):
                    nid = node.element_id
                    if nid not in nodes:
                        nodes[nid] = node_payload(node)

                seed_ids.add(a.element_id)
                edges.append({
                    "from": a.element_id,
                    "to": b.element_id,
                    "label": r.type,
                })

            total_malware = session.run(
                "MATCH (a:Malware) RETURN count(a) AS c"
            ).single()["c"]

            return {
                "nodes": list(nodes.values()),
                "edges": edges,
                "meta": {
                    "seeds": seeds,
                    "offset": offset,
                    "hide_text": bool(hide_text),
                    # 实际取到的种子数可能少于请求值（已到末尾）
                    "seed_count": len(seed_ids),
                    "node_count": len(nodes),
                    "edge_count": len(edges),
                    # 种子总数，前端据此判断"是否还有下一批"
                    "total_malware": total_malware,
                },
            }
    except Exception as e:
        print(f"⚠️ 获取可视化子图失败: {e}")
        return {"nodes": [], "edges": [], "meta": {}}


# ========================================
# 中英双层对照（v5 schema 支持）
# ========================================
# v5 图谱的结构特点：
#   * 每个实体都有 lang 属性（"cn" / "en"），中英各一套节点
#   * 关系名本身就是源数据字段名：中文层用「病毒家族 / 运行环境 / 解决方案 …」，
#     英文层用「Family / Platform / Solution …」——所以两层一眼可辨
#   * 只有**核心节点（:Malware 恶意软件本体）**之间存在 ALIGN_WITH 映射，
#     家族/平台/别名/文本节点都不跨层相连
#   * 中文层的 :Platform / :Category 节点 name 是中文（如 "Excel 文档"），
#     name_orig 保留源数据原值（"MSExcel"），跨层对应靠它


def list_dual_malware(limit: int = 200, keyword: str = "") -> List[Dict[str, Any]]:
    """
    列出**中英两层都有**的恶意软件（即核心节点已建立 ALIGN_WITH 映射的）

    只有这类病毒才适合做双层对照；中英两个源文件的病毒集合并不完全相同
    （各 51,802 / 51,805 条记录），只在一侧存在的病毒无法对照。

    按关系数降序返回，默认就能拿到内容丰富的样本，便于展示。

    Args:
        limit: 最多返回多少个
        keyword: 名称过滤（不区分大小写，空串表示不过滤）

    Returns:
        list: [{name, mal_type, degree}]
    """
    try:
        driver = get_neo4j_driver()
        with driver.session() as session:
            result = session.run(
                """
                MATCH (cn:Malware {lang:'cn'})-[:ALIGN_WITH]->(en:Malware {lang:'en'})
                WHERE $keyword = '' OR toLower(cn.name) CONTAINS toLower($keyword)
                RETURN cn.name AS name,
                       cn.mal_type AS mal_type,
                       COUNT { (cn)--() } AS degree
                ORDER BY degree DESC, name ASC
                LIMIT $limit
                """,
                limit=limit,
                keyword=keyword or "",
            )
            return [
                {
                    "name": rec["name"],
                    "mal_type": rec["mal_type"],
                    "degree": rec["degree"],
                }
                for rec in result
            ]
    except Exception as e:
        print(f"⚠️ 获取双层可对照的病毒列表失败: {e}")
        return []


def get_layer_graph(lang: str, malware_name: str, limit: int = 120) -> Dict[str, Any]:
    """
    取**单一语言层**里、以某个恶意软件为锚的子图

    用 OPTIONAL MATCH 保证即使该病毒没有出边，锚节点本身也会返回，
    前端不会出现"选中了病毒却是一片空白"。

    Args:
        lang: "cn" 或 "en"
        malware_name: 恶意软件名称（两层的 name 相同，如 Virus/MSExcel.Pri）
        limit: 最多返回多少条关系

    Returns:
        dict: {"nodes": [...], "edges": [...]}
    """
    try:
        driver = get_neo4j_driver()
        with driver.session() as session:
            result = session.run(
                """
                MATCH (a:Malware {lang: $lang, name: $name})
                OPTIONAL MATCH (a)-[r]->(b)
                WHERE b.lang = $lang
                RETURN a, r, b
                LIMIT $limit
                """,
                lang=lang,
                name=malware_name,
                limit=limit,
            )

            nodes: Dict[str, Dict[str, Any]] = {}
            edges: List[Dict[str, Any]] = []
            for record in result:
                a = record["a"]
                if a is not None and a.element_id not in nodes:
                    nodes[a.element_id] = node_payload(a)
                b = record["b"]
                r = record["r"]
                if b is None or r is None:
                    continue  # OPTIONAL MATCH 的空行（锚节点没有出边）
                if b.element_id not in nodes:
                    nodes[b.element_id] = node_payload(b)
                edges.append({
                    "from": a.element_id,
                    "to": b.element_id,
                    "label": r.type,
                })

            return {"nodes": list(nodes.values()), "edges": edges}
    except Exception as e:
        print(f"⚠️ 获取 {lang} 层子图失败: {e}")
        return {"nodes": [], "edges": []}


def get_dual_layer_graph(malware_name: str, limit: int = 120) -> Dict[str, Any]:
    """
    一次取回中英两层子图 + 核心节点的映射关系

    Args:
        malware_name: 恶意软件名称（中英两层同名）
        limit: 每层最多返回多少条关系

    Returns:
        dict: {virus, cn:{nodes,edges}, en:{nodes,edges}, core:{cn,en}, matched}
    """
    cn_graph = get_layer_graph("cn", malware_name, limit)
    en_graph = get_layer_graph("en", malware_name, limit)

    core = {"cn": None, "en": None}
    try:
        driver = get_neo4j_driver()
        with driver.session() as session:
            record = session.run(
                """
                MATCH (cn:Malware {lang:'cn', name: $name})
                      -[:ALIGN_WITH]->
                      (en:Malware {lang:'en', name: $name})
                RETURN elementId(cn) AS cn_id, elementId(en) AS en_id
                """,
                name=malware_name,
            ).single()
            if record:
                core = {"cn": record["cn_id"], "en": record["en_id"]}
    except Exception as e:
        print(f"⚠️ 查询核心节点映射失败: {e}")

    return {
        "virus": malware_name,
        "cn": cn_graph,
        "en": en_graph,
        "core": core,
        "matched": bool(core["cn"] and core["en"]),
    }


def get_node_detail(norm_name: str) -> Dict[str, Any]:
    """
    按 norm_name 查出"同一个实体的中英两版"，供并排属性对比

    只查 norm_name 是因为它是唯一带索引的字段（entity_norm_name）；
    换成 name / name_orig 都会在 170 万节点上做全表扫描。

    Args:
        norm_name: 节点规范化名（由 /api/graph/layers 返回的节点自带）

    Returns:
        dict: {"cn": {...}|None, "en": {...}|None}
    """
    out: Dict[str, Any] = {"cn": None, "en": None}
    try:
        driver = get_neo4j_driver()
        with driver.session() as session:
            result = session.run(
                """
                MATCH (n:Entity {norm_name: $norm})
                RETURN n
                LIMIT 20
                """,
                norm=norm_name,
            )
            for record in result:
                node = record["n"]
                lang = node.get("lang")
                if lang not in ("cn", "en") or out.get(lang):
                    continue
                props = {k: v for k, v in node.items() if v not in (None, "")}
                out[lang] = {
                    "id": node.element_id,
                    "label": node_display_name(node),
                    "type": node_display_type(node),
                    "labels": sorted(node.labels),
                    "name_orig": node.get("name_orig"),
                    "properties": props,
                }
            return out
    except Exception as e:
        print(f"⚠️ 查询节点详情失败: {e}")
        return out


def query_node_by_name(name: str) -> Optional[Dict]:
    """
    按名称查询节点
    
    Args:
        name: 节点名称
        
    Returns:
        dict: 节点信息，如果不存在返回None
    """
    try:
        driver = get_neo4j_driver()
        with driver.session() as session:
            result = session.run(
                """
                MATCH (n)
                WHERE n.name = $name
                RETURN n
                LIMIT 1
                """,
                name=name
            )
            record = result.single()
            if record:
                n = record["n"]
                return {
                    "id": n.element_id,
                    "name": n.get("name"),
                    "labels": list(n.labels),
                    "properties": dict(n.items())
                }
            return None
    except Exception as e:
        print(f"⚠️ 查询节点失败: {e}")
        return None


def query_relationships(node_name: str, direction: str = "both") -> List[Dict]:
    """
    查询与某个节点相关的所有关系
    
    Args:
        node_name: 节点名称
        direction: 关系方向 ('in', 'out', 'both')
        
    Returns:
        list: 关系列表
    """
    try:
        driver = get_neo4j_driver()
        if direction == "out":
            query = """
            MATCH (n {name: $name})-[r]->(m)
            RETURN n, r, m
            """
        elif direction == "in":
            query = """
            MATCH (m)-[r]->(n {name: $name})
            RETURN n, r, m
            """
        else:  # both
            query = """
            MATCH (n {name: $name})-[r]-(m)
            RETURN n, r, m
            """
        
        relationships = []
        with driver.session() as session:
            result = session.run(query, name=node_name)
            for record in result:
                relationships.append({
                    "source": record["n"].get("name"),
                    "relation": record["r"].type,
                    "target": record["m"].get("name"),
                })
        
        return relationships
    except Exception as e:
        print(f"⚠️ 查询关系失败: {e}")
        return []


def close_driver():
    """
    关闭Neo4j驱动连接
    应在应用关闭时调用
    """
    global _driver
    if _driver:
        try:
            _driver.close()
            _driver = None
            print("✅ Neo4j 驱动已关闭")
        except Exception as e:
            print(f"⚠️ 关闭Neo4j驱动失败: {e}")
