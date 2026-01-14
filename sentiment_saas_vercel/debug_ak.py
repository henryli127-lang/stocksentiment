
import akshare as ak

# Inspect akshare for guba functions
functions = dir(ak)
guba_funcs = [f for f in functions if 'guba' in f]
print(f"Found Guba functions: {guba_funcs}")

# Also check for 'comment'
comment_funcs = [f for f in functions if 'comment' in f]
print(f"Found Comment functions: {comment_funcs}")
