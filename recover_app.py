import json

transcript_path = "/Users/anvinpshibu/.gemini/antigravity-ide/brain/24349bd0-a430-44fb-97f2-d1044abead00/.system_generated/logs/transcript_full.jsonl"

def main():
    target_file = "/Users/anvinpshibu/Documents/Projects-Araskova/Aerial/src/App.tsx"
    
    with open(transcript_path, 'r') as f:
        lines = f.readlines()
        
    last_content = None
    
    for line in lines:
        try:
            data = json.loads(line)
            if data.get("type") == "PLANNER_RESPONSE":
                tool_calls = data.get("tool_calls", [])
                for tc in tool_calls:
                    if tc.get("name") in ["multi_replace_file_content", "replace_file_content"]:
                        args = tc.get("args", {})
                        if args.get("TargetFile") == target_file:
                            pass
        except:
            pass
            
    print("Script ran")

main()
