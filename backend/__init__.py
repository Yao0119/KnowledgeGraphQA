"""
KnowledgeGraphQA 后端包。

说明：这个文件的存在是必要的 —— 没有它，`backend` 只能作为 PEP 420 隐式命名空间包
被导入，而 `backend` 是非常通用的名字，任何已安装的同名包或 cwd 下的同名目录都会抢先，
import 结果取决于是"从哪里启动"的。显式声明为常规包后，导入行为才稳定可预测。

启动方式（必须在仓库根目录执行，这样 `backend` 才在 sys.path 上）：
    python -m uvicorn backend.main:app --reload --port 8000
"""
