# Obsidian custom suggester

Example config:

````markdown
```json
{
  "triggers": [
    {
      "before": "【",
      "after": "】",
      "matchRegex": "【([^】]*)$",
      "suggestion": [
        "已完成，等待确认",
        "已放弃",
        "已完成，客户确认"
      ]
    }
  ]
}
```
````
