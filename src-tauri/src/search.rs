use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SearchResult {
    pub title: String,
    pub snippet: String,
    pub link: String,
    pub source: String,
}

#[derive(Deserialize, Debug, Default)]
pub struct SearchOptions {
    pub engine: Option<String>,
    pub api_key: Option<String>,
}

fn strip_html_tags(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    for c in input.chars() {
        if c == '<' {
            in_tag = true;
        } else if c == '>' {
            in_tag = false;
        } else if !in_tag {
            out.push(c);
        }
    }
    out.replace("&nbsp;", " ")
        .replace("&ensp;", " ")
        .replace("&emsp;", " ")
        .replace("&quot;", "\"")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&#0183;", "·")
        .replace("&#39;", "'")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn extract_tag_content(html: &str, tag: &str) -> Option<String> {
    let open_tag = format!("<{}", tag);
    let close_tag = format!("</{}>", tag);
    let start_pos = html.find(&open_tag)?;
    let tag_end = html[start_pos..].find('>')? + start_pos + 1;
    let end_pos = html[tag_end..].find(&close_tag)? + tag_end;
    Some(html[tag_end..end_pos].to_string())
}

fn extract_href(html: &str) -> Option<String> {
    let href_needle = "href=\"";
    let start_pos = html.find(href_needle)? + href_needle.len();
    let end_pos = html[start_pos..].find('"')? + start_pos;
    let link = &html[start_pos..end_pos];
    if link.starts_with("http://") || link.starts_with("https://") {
        Some(link.to_string())
    } else {
        None
    }
}

// Check for common Chinese city names
const CITIES: &[&str] = &[
    "北京", "上海", "广州", "深圳", "济南", "青岛", "杭州", "南京", "成都", "武汉",
    "重庆", "西安", "天津", "苏州", "长沙", "郑州", "沈阳", "大连", "厦门", "福州",
    "宁波", "昆明", "哈尔滨", "长春", "合肥", "南昌", "贵阳", "太原", "石家庄", "南宁",
    "海口", "乌鲁木齐", "兰州", "呼和浩特", "银川", "西宁", "拉萨", "东莞", "佛山", "无锡",
    "烟台", "潍坊", "临沂", "淄博", "威海", "泰安", "德州", "聊城", "日照", "滨州",
    "菏泽", "枣庄", "温州", "常州", "绍兴", "泉州", "南通", "嘉兴", "金华", "珠海",
    "中山", "保定", "邯郸", "洛阳", "唐山", "徐州", "三亚", "香港", "澳门", "台北"
];

fn detect_city(query: &str) -> Option<&'static str> {
    for city in CITIES {
        if query.contains(city) {
            return Some(city);
        }
    }
    None
}

async fn fetch_weather(client: &reqwest::Client, city: &str) -> Option<SearchResult> {
    let url = format!("https://wttr.in/{}?format=j1&lang=zh", city);
    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .timeout(Duration::from_secs(4))
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let json: serde_json::Value = resp.json().await.ok()?;
    let cur = json.get("current_condition")?.get(0)?;
    let temp_c = cur.get("temp_C")?.as_str()?;
    let humidity = cur.get("humidity")?.as_str().unwrap_or("--");
    let wind_speed = cur.get("windspeedKmph")?.as_str().unwrap_or("--");
    let wind_dir = cur.get("winddir16Point")?.as_str().unwrap_or("");
    
    // Description
    let desc = cur
        .get("lang_zh")
        .and_then(|v| v.get(0))
        .and_then(|v| v.get("value"))
        .and_then(|v| v.as_str())
        .or_else(|| {
            cur.get("weatherDesc")
                .and_then(|v| v.get(0))
                .and_then(|v| v.get("value"))
                .and_then(|v| v.as_str())
        })
        .unwrap_or("晴");

    // Weather forecast for today
    let today_w = json.get("weather").and_then(|v| v.get(0));
    let max_temp = today_w.and_then(|w| w.get("maxtempC")).and_then(|v| v.as_str()).unwrap_or(temp_c);
    let min_temp = today_w.and_then(|w| w.get("mintempC")).and_then(|v| v.as_str()).unwrap_or(temp_c);
    let astronomy = today_w.and_then(|w| w.get("astronomy")).and_then(|v| v.get(0));
    let sunrise = astronomy.and_then(|a| a.get("sunrise")).and_then(|v| v.as_str()).unwrap_or("");
    let sunset = astronomy.and_then(|a| a.get("sunset")).and_then(|v| v.as_str()).unwrap_or("");

    let mut snippet = format!(
        "【{}实时天气】：当前气温 {}℃，天气状况：{}，今日气温范围 {}℃ ~ {}℃，相对湿度 {}%，风速 {} km/h（{}）。",
        city, temp_c, desc, min_temp, max_temp, humidity, wind_speed, wind_dir
    );
    if !sunrise.is_empty() && !sunset.is_empty() {
        snippet.push_str(&format!(" 今日日出 {}，日落 {}。", sunrise, sunset));
    }

    Some(SearchResult {
        title: format!("{}实时天气与今日预报", city),
        snippet,
        link: format!("https://wttr.in/{}", city),
        source: "实时气象".to_string(),
    })
}

fn clean_search_query(raw: &str) -> String {
    let mut q = raw.trim().to_string();

    // 1. 过滤口语化开头
    let prefixes = [
        "请问一下", "请问", "请帮我查一下", "请帮我查", "请帮我", "帮我查一下", "帮我查", "帮我看看", "帮我",
        "想问一下", "我想知道", "请教一下", "能否告诉我", "能不能告诉我", "查一下", "看一下", "搜索一下", "搜一下"
    ];
    for p in &prefixes {
        if q.starts_with(p) {
            q = q[p.len()..].trim().to_string();
        }
    }

    // 2. 过滤末尾标点
    q = q.trim_end_matches(|c: char| c.is_ascii_punctuation() || matches!(c, '？' | '?' | '！' | '!' | '。' | '，' | '、')).trim().to_string();

    // 3. 过滤口语化结尾
    let endings = [
        "有什么", "有哪些", "怎么样", "好不好", "如何", "是什么", "么", "吗", "呢", "啊"
    ];
    for end in &endings {
        if q.ends_with(end) {
            q = q[..q.len() - end.len()].trim().to_string();
        }
    }

    let is_date_or_weather = q.contains("天气") || q.contains("气温") || q.contains("几号") || q.contains("星期几") || q.contains("周几");

    // 4. 对非查日历/天气的普通提问，将“今天/今日/现在”替换为“最新”，彻底避免触发搜索引擎的日历/黄历意图！
    if !is_date_or_weather {
        q = q.replace("今天", "最新 ")
             .replace("今日", "最新 ")
             .replace("现在", "最新 ")
             .replace("目前", "最新 ")
             .replace("当前", "最新 ");
    }

    q = q.replace("有什么", " ")
         .replace("有哪些", " ")
         .replace("吗", "")
         .replace("呢", "");

    q.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn is_junk_result(title: &str, query: &str) -> bool {
    let is_calendar_query = query.contains("黄历") || query.contains("日历") || query.contains("农历") || query.contains("吉日") || query.contains("星期");
    if !is_calendar_query {
        let junk_keywords = ["黄历", "老黄历", "日历网", "黄道吉日", "万年历", "历史上的今天"];
        for junk in &junk_keywords {
            if title.contains(junk) {
                return true;
            }
        }
    }
    false
}

async fn search_bing(client: &reqwest::Client, query: &str) -> Result<Vec<SearchResult>, String> {
    let cleaned_query = clean_search_query(query);
    let search_term = if cleaned_query.is_empty() { query } else { &cleaned_query };

    let resp = client
        .get("https://cn.bing.com/search")
        .query(&[("q", search_term), ("setlang", "zh-hans")])
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .map_err(|e| format!("Bing 请求超时或失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Bing 返回状态异常: HTTP {}", resp.status()));
    }

    let html = resp.text().await.map_err(|e| format!("读取内容失败: {}", e))?;
    let mut results = Vec::new();

    let blocks: Vec<&str> = html.split("<li class=\"b_algo\"").collect();
    for block in blocks.iter().skip(1).take(8) {
        if results.len() >= 5 {
            break;
        }
        if let Some(end_idx) = block.find("</li>") {
            let item = &block[..end_idx];
            let title_raw = extract_tag_content(item, "h2");
            let link = extract_href(item);
            let snippet_raw = extract_tag_content(item, "p");

            if let (Some(title_html), Some(link_url)) = (title_raw, link) {
                let clean_title = strip_html_tags(&title_html);
                let clean_snippet = snippet_raw.map(|s| strip_html_tags(&s)).unwrap_or_default();
                
                // 排除无关黄历/日历等垃圾站
                if is_junk_result(&clean_title, query) {
                    continue;
                }

                if !clean_title.is_empty() {
                    results.push(SearchResult {
                        title: clean_title,
                        snippet: clean_snippet,
                        link: link_url,
                        source: "Bing 搜索".to_string(),
                    });
                }
            }
        }
    }

    Ok(results)
}

async fn search_tavily(client: &reqwest::Client, query: &str, api_key: &str) -> Result<Vec<SearchResult>, String> {
    let payload = serde_json::json!({
        "api_key": api_key,
        "query": query,
        "search_depth": "basic",
        "include_answer": false,
        "max_results": 5
    });

    let resp = client
        .post("https://api.tavily.com/search")
        .json(&payload)
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Tavily 请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Tavily HTTP 错误: {}", resp.status()));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| format!("解析 Tavily 失败: {}", e))?;
    let mut list = Vec::new();
    if let Some(items) = json.get("results").and_then(|v| v.as_array()) {
        for item in items {
            let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let snippet = item.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let link = item.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if !title.is_empty() && !link.is_empty() {
                list.push(SearchResult {
                    title,
                    snippet,
                    link,
                    source: "Tavily".to_string(),
                });
            }
        }
    }
    Ok(list)
}

#[tauri::command]
pub async fn web_search(query: String, options: Option<SearchOptions>) -> Result<Vec<SearchResult>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let opts = options.unwrap_or_default();

    // 1. If user configured Tavily API Key
    if let (Some(engine), Some(key)) = (&opts.engine, &opts.api_key) {
        if engine == "tavily" && !key.trim().is_empty() {
            if let Ok(res) = search_tavily(&client, trimmed, key.trim()).await {
                if !res.is_empty() {
                    return Ok(res);
                }
            }
        }
    }

    // 2. Built-in search: check weather query first
    let is_weather_query = trimmed.contains("天气")
        || trimmed.contains("气温")
        || trimmed.contains("温度")
        || trimmed.contains("下雨")
        || trimmed.contains("预报");

    let mut results = Vec::new();

    if is_weather_query {
        if let Some(city) = detect_city(trimmed) {
            if let Some(weather_res) = fetch_weather(&client, city).await {
                results.push(weather_res);
            }
        }
    }

    // 3. Perform general Bing search
    match search_bing(&client, trimmed).await {
        Ok(bing_results) => {
            for item in bing_results {
                results.push(item);
            }
        }
        Err(e) => {
            // If we have weather result, return it even if Bing fails
            if results.is_empty() {
                return Err(e);
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn fetch_webpage(url: String) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(trimmed)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let html = resp.text().await.map_err(|e| format!("读取网页失败: {}", e))?;

    // Remove scripts and styles
    let mut clean = html;
    while let Some(start) = clean.find("<script") {
        if let Some(end) = clean[start..].find("</script>") {
            clean.replace_range(start..start + end + 9, " ");
        } else {
            break;
        }
    }
    while let Some(start) = clean.find("<style") {
        if let Some(end) = clean[start..].find("</style>") {
            clean.replace_range(start..start + end + 8, " ");
        } else {
            break;
        }
    }

    let text = strip_html_tags(&clean);
    if text.chars().count() > 2500 {
        let truncated: String = text.chars().take(2500).collect();
        Ok(format!("{}...\n(正文已截断)", truncated))
    } else {
        Ok(text)
    }
}
