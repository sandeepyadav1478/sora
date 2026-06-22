import json, os, sys
import urllib.request, urllib.parse

alerts_path = "archive-alerts.json"
if not os.path.exists(alerts_path):
    print("No archive-alerts.json found — skipping.")
    sys.exit(0)

alerts = json.load(open(alerts_path))
if not alerts:
    print("No unarchive candidates.")
    sys.exit(0)

token = os.environ["GH_API_TOKEN"]
repo  = os.environ["GH_REPO"]
api   = f"https://api.github.com/repos/{repo}"
hdrs  = {
    "Authorization": f"Bearer {token}",
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
}

def api_call(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"{api}{path}", data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"API error {method} {path}: {e}")
        return {}

# Ensure label exists (201=created, 422=exists — both ok)
api_call("POST", "/labels", {
    "name": "unarchive-candidate",
    "color": "0075ca",
    "description": "Repo has recent activity but is marked archived",
})

for alert in alerts:
    title = f"[Sora] Unarchive candidate: {alert['githubRepo']}"
    q = urllib.parse.quote(title)
    search = f"https://api.github.com/search/issues?q={q}+in:title+repo:{repo}+state:open&per_page=1"
    req = urllib.request.Request(search, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            results = json.loads(r.read())
        if results.get("total_count", 0) > 0:
            print(f"Issue already open for {alert['githubRepo']} — skipping")
            continue
    except Exception as e:
        print(f"Search error: {e}")
        continue

    body = (
        f"## Unarchive candidate\n\n"
        f"**Work entry:** {alert['title']}\n"
        f"**Repo:** {alert['githubRepo']}\n\n"
        f"This repo appears in your recent GitHub activity feed but is marked `status: archived` in your works.\n\n"
        f"**To promote it back to active:**\n"
        f"1. Open `src/data/works/<entry>.md`\n"
        f"2. Change `status: archived` to `status: active` (or `maintained` / `in-production`)\n"
        f"3. Update `modDatetime` to today\n\n"
        f"_This issue will not reopen once you close it unless new activity is detected in a future sync._\n"
    )
    api_call("POST", "/issues", {
        "title": title,
        "body": body,
        "labels": ["unarchive-candidate"],
    })
    print(f"Opened issue for {alert['githubRepo']}")
