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

// ----------------------------------------------------
// 1. Weather Sniffer (wttr.in)
// ----------------------------------------------------
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

// ----------------------------------------------------
// 2. Stock / Finance Sniffer (A-share Realtime Quotes)
// ----------------------------------------------------
fn detect_stock_code(query: &str) -> Option<(&'static str, String)> {
    let chars: Vec<char> = query.chars().collect();
    let len = chars.len();
    for i in 0..len {
        if chars[i].is_ascii_digit() {
            let mut end = i;
            while end < len && chars[end].is_ascii_digit() {
                end += 1;
            }
            if end - i == 6 {
                let code: String = chars[i..end].iter().collect();
                let prefix = if code.starts_with("60")
                    || code.starts_with("688")
                    || code.starts_with("689")
                    || code.starts_with("900")
                {
                    "sh"
                } else if code.starts_with("00") || code.starts_with("30") || code.starts_with("20") {
                    "sz"
                } else if code.starts_with("8") || code.starts_with("4") || code.starts_with("92") {
                    "bj"
                } else {
                    ""
                };
                if !prefix.is_empty() {
                    return Some((prefix, code));
                }
            }
        }
    }
    None
}

async fn fetch_stock_quote(client: &reqwest::Client, prefix: &str, code: &str) -> Option<SearchResult> {
    let url = format!("https://qt.gtimg.cn/q={}{}", prefix, code);
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

    let bytes = resp.bytes().await.ok()?;
    let (decoded, _, _) = encoding_rs::GBK.decode(&bytes);
    let text = decoded.to_string();

    let start_idx = text.find('"')? + 1;
    let end_idx = text.rfind('"')?;
    if end_idx <= start_idx {
        return None;
    }
    let data_str = &text[start_idx..end_idx];
    let parts: Vec<&str> = data_str.split('~').collect();
    if parts.len() < 40 {
        return None;
    }

    let name = parts.get(1)?.trim();
    if name.is_empty() {
        return None;
    }
    let cur_price = parts.get(3)?.trim();
    let prev_close = parts.get(4)?.trim();
    let open_price = parts.get(5)?.trim();
    let change_amt = parts.get(31)?.trim();
    let change_pct = parts.get(32)?.trim();
    let high = parts.get(33)?.trim();
    let low = parts.get(34)?.trim();
    let amount_w = parts.get(37)?.trim();
    let turnover = parts.get(38).unwrap_or(&"--").trim();
    let pe = parts.get(39).unwrap_or(&"--").trim();
    let market_cap = parts.get(45).unwrap_or(&"--").trim();

    let sign = if change_amt.starts_with('-') { "" } else { "+" };
    let snippet = format!(
        "【{} ({}) 实时盘面】：最新价 {}元，今日涨跌幅 {}{}% ({}{}元)，今开 {}元，昨收 {}元，最高 {}元，最低 {}元，成交额 {}万元，换手率 {}%，市盈率(PE) {}，总市值 {}亿元。",
        name, code, cur_price, sign, change_pct, sign, change_amt, open_price, prev_close, high, low, amount_w, turnover, pe, market_cap
    );

    Some(SearchResult {
        title: format!("【{} ({})】A股最新实时行情报价", name, code),
        snippet,
        link: format!("https://gu.qq.com/{}{}", prefix, code),
        source: "实时证券行情".to_string(),
    })
}

// ----------------------------------------------------
// 3. Search Engine Providers
// ----------------------------------------------------
async fn search_bing(client: &reqwest::Client, query: &str) -> Result<Vec<SearchResult>, String> {
    let resp = client
        .get("https://cn.bing.com/search")
        .query(&[("q", query), ("setlang", "zh-hans")])
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
    for block in blocks.iter().skip(1).take(5) {
        if let Some(end_idx) = block.find("</li>") {
            let item = &block[..end_idx];
            let title_raw = extract_tag_content(item, "h2");
            let link = extract_href(item);
            let snippet_raw = extract_tag_content(item, "p");

            if let (Some(title_html), Some(link_url)) = (title_raw, link) {
                let clean_title = strip_html_tags(&title_html);
                let clean_snippet = snippet_raw.map(|s| strip_html_tags(&s)).unwrap_or_default();
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

async fn search_bocha(client: &reqwest::Client, query: &str, api_key: &str) -> Result<Vec<SearchResult>, String> {
    let payload = serde_json::json!({
        "query": query,
        "freshness": "noLimit",
        "summary": true,
        "count": 5
    });

    let resp = client
        .post("https://api.bochaai.com/v1/web-search")
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .json(&payload)
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .map_err(|e| format!("博查请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("博查 HTTP 错误: {}", resp.status()));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| format!("解析博查返回失败: {}", e))?;
    let mut list = Vec::new();
    if let Some(items) = json
        .get("data")
        .and_then(|d| d.get("webPages"))
        .and_then(|w| w.get("value"))
        .and_then(|v| v.as_array())
    {
        for item in items {
            let title = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let snippet = item
                .get("summary")
                .and_then(|v| v.as_str())
                .or_else(|| item.get("snippet").and_then(|v| v.as_str()))
                .unwrap_or("")
                .to_string();
            let link = item.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if !title.is_empty() && !link.is_empty() {
                list.push(SearchResult {
                    title,
                    snippet,
                    link,
                    source: "博查 AI 搜索".to_string(),
                });
            }
        }
    }
    Ok(list)
}

// ----------------------------------------------------
// 4. Main Entry Point: web_search
// ----------------------------------------------------
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
    let mut results = Vec::new();

    // 1. Specialized Domain Sniffing: A-share stock realtime quote
    let is_stock_query = trimmed.contains("股票")
        || trimmed.contains("股价")
        || trimmed.contains("行情")
        || trimmed.contains("市值");
    if let Some((prefix, code)) = detect_stock_code(trimmed) {
        if is_stock_query || trimmed.chars().all(|c| c.is_ascii_digit() || c.is_whitespace()) {
            if let Some(stock_res) = fetch_stock_quote(&client, prefix, &code).await {
                results.push(stock_res);
            }
        }
    }

    // 2. Specialized Domain Sniffing: Weather
    let is_weather_query = trimmed.contains("天气")
        || trimmed.contains("气温")
        || trimmed.contains("温度")
        || trimmed.contains("下雨")
        || trimmed.contains("预报");
    if is_weather_query {
        if let Some(city) = detect_city(trimmed) {
            if let Some(weather_res) = fetch_weather(&client, city).await {
                results.push(weather_res);
            }
        }
    }

    // 3. Search Engine Execution
    let engine = opts.engine.as_deref().unwrap_or("builtin");
    let key = opts.api_key.as_deref().unwrap_or("").trim();

    if engine == "bocha" && !key.is_empty() {
        match search_bocha(&client, trimmed, key).await {
            Ok(bocha_res) if !bocha_res.is_empty() => {
                results.extend(bocha_res);
                return Ok(results);
            }
            _ => {}
        }
    } else if engine == "tavily" && !key.is_empty() {
        match search_tavily(&client, trimmed, key).await {
            Ok(tavily_res) if !tavily_res.is_empty() => {
                results.extend(tavily_res);
                return Ok(results);
            }
            _ => {}
        }
    }

    // 4. Default / Fallback: Bing Search
    match search_bing(&client, trimmed).await {
        Ok(bing_results) => {
            results.extend(bing_results);
        }
        Err(e) => {
            if results.is_empty() {
                return Err(e);
            }
        }
    }

    Ok(results)
}

// ----------------------------------------------------
// 5. Anti-SSRF Security Guard
// ----------------------------------------------------
fn is_public_url(url: &str) -> std::result::Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("URL 解析失败: {}", e))?;
    if !(parsed.scheme() == "http" || parsed.scheme() == "https") {
        return Err("仅允许访问 http/https 链接".into());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "URL 缺少主机名".to_string())?;

    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        if !is_public_ip(ip) {
            return Err("不允许访问内网/本机地址".into());
        }
        return Ok(());
    }

    use std::net::ToSocketAddrs;
    let addr_port = format!("{}:443", host);
    let resolved = addr_port
        .to_socket_addrs()
        .map_err(|e| format!("主机解析失败: {}", e))?;
    for sa in resolved {
        if !is_public_ip(sa.ip()) {
            return Err("目标地址包含内网/本机地址，已阻止访问".into());
        }
    }
    Ok(())
}

fn is_public_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            !(v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || v4.is_multicast()
                || (v4.octets()[0] == 100 && v4.octets()[1] & 0b1100_0000 == 0b0100_0000)
                || (v4.octets()[0] == 192 && v4.octets()[1] == 0))
        }
        std::net::IpAddr::V6(v6) => {
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (v6.segments()[0] & 0xfe00 == 0xfc00))
        }
    }
}

// ----------------------------------------------------
// 6. Deep Webpage Reader (Jina Reader + Local Fallback)
// ----------------------------------------------------
#[tauri::command]
pub async fn fetch_webpage(url: String) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }

    is_public_url(&trimmed)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    // 1. High-fidelity extraction via Jina Reader (cleans DOM, strips ads, returns Markdown)
    let jina_url = format!("https://r.jina.ai/{}", trimmed);
    if let Ok(jina_resp) = client
        .get(&jina_url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .send()
        .await
    {
        if jina_resp.status().is_success() {
            if let Ok(jina_text) = jina_resp.text().await {
                let content = if let Some(pos) = jina_text.find("Markdown Content:") {
                    jina_text[pos + "Markdown Content:".len()..].trim()
                } else {
                    jina_text.trim()
                };

                if content.len() > 100 {
                    let text = content.to_string();
                    if text.chars().count() > 3500 {
                        let truncated: String = text.chars().take(3500).collect();
                        return Ok(format!("{}...\n(正文已截断)", truncated));
                    } else {
                        return Ok(text);
                    }
                }
            }
        }
    }

    // 2. Resilient local fallback: direct HTTP scrape + tag cleaning
    let resp = client
        .get(trimmed)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let html = resp.text().await.map_err(|e| format!("读取网页失败: {}", e))?;

    // Remove scripts, styles, header, nav, footer
    let mut clean = html;
    for tag in &["script", "style", "nav", "footer", "header"] {
        let open_tag = format!("<{}", tag);
        let close_tag = format!("</{}>", tag);
        while let Some(start) = clean.find(&open_tag) {
            if let Some(end) = clean[start..].find(&close_tag) {
                clean.replace_range(start..start + end + close_tag.len(), " ");
            } else {
                break;
            }
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

// ----------------------------------------------------
// 7. AI Chat HTTP Proxy (bypasses browser CORS & CSP restrictions)
// ----------------------------------------------------
#[tauri::command]
pub async fn ai_chat_proxy(url: String, api_key: String, body: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| format!("无法创建网络请求客户端: {}", e))?;

    let mut req = client
        .post(&url)
        .header("Content-Type", "application/json");

    let trimmed_key = api_key.trim();
    if !trimmed_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", trimmed_key));
    }

    let resp = req
        .body(body)
        .send()
        .await
        .map_err(|e| format!("后端网络连接失败: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("读取回复失败: {}", e))?;

    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status.as_u16(), text));
    }

    Ok(text)
}
