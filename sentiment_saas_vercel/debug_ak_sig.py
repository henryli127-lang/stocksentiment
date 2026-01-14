
import akshare as ak
import inspect

try:
    sig = inspect.signature(ak.stock_comment_em)
    print(f"Signature of stock_comment_em: {sig}")
except AttributeError:
    print("stock_comment_em not found")
except Exception as e:
    print(f"Error: {e}")
