
import akshare as ak
import inspect

funcs = ['stock_comment_detail_scrd_desire_em', 'stock_comment_detail_scrd_focus_em', 'stock_comment_detail_zhpj_lspf_em', 'stock_comment_detail_zlkp_jgcyd_em', 'stock_comment_em']

for f_name in funcs:
    try:
        f = getattr(ak, f_name)
        sig = inspect.signature(f)
        print(f"Signature of {f_name}: {sig}")
    except Exception as e:
        print(f"Error inspecting {f_name}: {e}")
