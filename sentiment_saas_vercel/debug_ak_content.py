
import akshare as ak
import pandas as pd

symbol = '600519'

print("--- Testing stock_comment_detail_scrd_focus_em ---")
try:
    df = ak.stock_comment_detail_scrd_focus_em(symbol=symbol)
    print("Columns:", df.columns.tolist())
    if not df.empty:
        print("First row:", df.iloc[0].to_dict())
except Exception as e:
    print("Error:", e)

print("\n--- Testing stock_comment_em (No Args) ---")
try:
    df = ak.stock_comment_em()
    print("Columns:", df.columns.tolist())
    if not df.empty:
        print("First row:", df.iloc[0].to_dict())
except Exception as e:
    print("Error:", e)
