/* eslint-disable */
// Second batch: explainer content for the remaining 16 tools.
// Run after add-explainers.js. Use ASCII single quotes inside strings to
// avoid JS-string-termination booby traps with non-ASCII characters.

const fs = require("fs");
const path = require("path");

const LOCALES = ["de", "en", "hi", "zh"];
const FILES = Object.fromEntries(
  LOCALES.map((l) => [l, path.join(__dirname, "..", "web", "messages", `${l}.json`)])
);

const E = {
  bgp: {
    de: {
      purpose:
        "Die BGP-Abfrage zeigt aus den globalen Routing-Tabellen welche AS-Nummer eine IP-Adresse ankündigt, welche Präfixe ein AS hält und mit welchen Nachbar-AS es peert. Die Daten kommen live von RIPEstat — derselben Quelle die Network-Engineers für Routing-Diagnose nutzen.",
      how_it_works:
        "Anfrage geht an stat.ripe.net (RIPE NCC), das einen vollen Routing-View hat.\nFuer eine IP wird das spezifischste angekuendigte Praefix und das Origin-AS zurueckgegeben.\nFuer ein AS bekommst du die Liste aller angekuendigten Praefixe und Peerings.",
      when_to_use:
        "Cloud-Provider von Endkunden-ISPs unterscheiden (Hosting-Erkennung).\nRouten-Hijacks oder unbeabsichtigte Re-Announcements diagnostizieren.\nSichtbarkeit eines eigenen Praefixes weltweit pruefen.",
      limits:
        "Routing-Daten sind Snapshot-basiert; sehr frische Aenderungen brauchen Minuten.\nKeine Visualisierung der AS-Pfade (nur direkte Nachbarn).",
    },
    en: {
      purpose:
        "BGP Lookup queries the global routing tables to show which AS announces a given IP, which prefixes an AS holds, and which neighbour ASes it peers with. Data comes live from RIPEstat — the same source network engineers use for routing diagnostics.",
      how_it_works:
        "Queries hit stat.ripe.net (RIPE NCC), which has a full routing view.\nFor an IP, the most-specific announced prefix and the origin AS are returned.\nFor an AS, you get every announced prefix and its peering list.",
      when_to_use:
        "Distinguish cloud providers from residential ISPs (hosting detection).\nDiagnose route hijacks or unintended re-announcements.\nCheck global visibility of your own prefix.",
      limits:
        "Routing data is snapshotted; very recent changes take minutes to surface.\nNo full AS-path visualisation (only direct neighbours).",
    },
    hi: {
      purpose:
        "BGP लुकअप वैश्विक रूटिंग तालिकाओं से दिखाता है कि कौन सा AS किसी IP की घोषणा करता है, कोई AS कौन-से प्रीफ़िक्स रखता है, और किन पड़ोसी AS के साथ peer करता है। डेटा RIPEstat से लाइव आता है।",
      how_it_works:
        "क्वेरी stat.ripe.net (RIPE NCC) पर जाती है जिसके पास पूर्ण रूटिंग व्यू है।\nIP के लिए सबसे विशिष्ट घोषित प्रीफ़िक्स और मूल AS लौटाया जाता है।\nAS के लिए सभी घोषित प्रीफ़िक्स और peering सूची मिलती है।",
      when_to_use:
        "क्लाउड प्रदाताओं को निवासी ISP से अलग पहचानें।\nरूट हाइजैक या अनजाने पुन: घोषणाओं का निदान करें।\nअपने प्रीफ़िक्स की वैश्विक दृश्यता जाँचें।",
      limits:
        "रूटिंग डेटा स्नैपशॉट है; बहुत हाल के परिवर्तनों में मिनट लगते हैं।\nपूर्ण AS-पथ विज़ुअलाइज़ेशन नहीं।",
    },
    zh: {
      purpose:
        "BGP 查询从全球路由表显示某个 IP 由哪个 AS 宣告、某个 AS 持有哪些前缀以及与哪些邻居 AS 对等。数据来自 RIPEstat — 网络工程师诊断路由的同一数据源。",
      how_it_works:
        "查询命中 stat.ripe.net (RIPE NCC)，拥有完整路由视图。\n对 IP 返回最具体的宣告前缀和源 AS。\n对 AS 返回所有宣告前缀和对等列表。",
      when_to_use:
        "区分云服务商和住宅 ISP (托管识别)。\n诊断路由劫持或意外重新宣告。\n检查自己前缀的全球可见性。",
      limits:
        "路由数据为快照；最新变更需要数分钟显现。\n无完整 AS 路径可视化 (仅直接邻居)。",
    },
  },

  blacklist: {
    de: {
      purpose:
        "Der IP-Blacklist-Check prüft eine IP gleichzeitig gegen 20+ bekannte Spam-DNSBLs (Spamhaus, Barracuda, SORBS, SpamCop, …). Listet Treffer mit dem Listing-Grund auf. Wichtig für Mail-Server-Operator und IT-Forensik.",
      how_it_works:
        "Pro Liste ein DNS-Lookup unter dem reversed-IP-Format an die DNSBL-Domain.\nAlle Listen werden parallel abgefragt (3 s Timeout je Liste).\nResolved-Antworten enthalten oft einen Code, der den Listing-Grund verraet.",
      when_to_use:
        "Wenn deine Mails als Spam abgelehnt werden — pruefe ob deine Mail-IP gelistet ist.\nNach IP-Wechsel beim ISP/Cloud-Provider nochmal pruefen.\nVerdaechtige IPs aus Logs gegen Spamhaus pruefen.",
      limits:
        "Eine 'saubere' IP heisst nicht garantiert gut — manche Listings sind privat.\nListung kann mit Verzoegerung kommen (TTL-Cache der DNSBLs).",
    },
    en: {
      purpose:
        "IP Blacklist Check tests an IP against 20+ well-known spam DNSBLs (Spamhaus, Barracuda, SORBS, SpamCop, …) in parallel. Hits include the listing reason. Important for mail-server operators and IT forensics.",
      how_it_works:
        "One DNS lookup per list using reversed-IP under the DNSBL domain.\nAll lists are queried in parallel with a 3 s timeout each.\nResolved answers often carry a code revealing the listing reason.",
      when_to_use:
        "When your mail is being rejected as spam — check whether your mail IP is listed.\nRe-check after an IP change at your ISP / cloud provider.\nCheck suspicious IPs from logs against Spamhaus.",
      limits:
        "A 'clean' IP isn't a guarantee — some lists are private.\nListings may be cached briefly (DNSBL TTL).",
    },
    hi: {
      purpose:
        "IP ब्लैकलिस्ट जाँच एक IP को 20+ प्रसिद्ध स्पैम DNSBL (Spamhaus, Barracuda, SORBS, SpamCop) के विरुद्ध समानांतर परीक्षण करती है। हिट के साथ कारण दिखाए जाते हैं।",
      how_it_works:
        "प्रत्येक सूची के लिए reversed-IP का DNS लुकअप।\nसभी सूचियाँ समानांतर में, 3 s टाइमआउट के साथ।\nहल किए गए उत्तरों में कारण कोड शामिल होता है।",
      when_to_use:
        "यदि आपकी मेल स्पैम के रूप में अस्वीकृत हो रही हो।\nISP/क्लाउड प्रदाता पर IP बदलने के बाद।\nलॉग की संदिग्ध IPs को Spamhaus से जाँचें।",
      limits:
        "'साफ' IP गारंटी नहीं — कुछ सूचियाँ निजी हैं।\nलिस्टिंग कैश के कारण विलंबित दिख सकती है।",
    },
    zh: {
      purpose:
        "IP 黑名单检查并行将 IP 与 20+ 知名垃圾邮件 DNSBL (Spamhaus、Barracuda、SORBS、SpamCop 等) 比对。命中时显示原因。对邮件服务器运维和 IT 取证很重要。",
      how_it_works:
        "每个列表对反转 IP 在 DNSBL 域下进行一次 DNS 查询。\n所有列表并行查询，每个 3 秒超时。\n解析的应答通常含有原因代码。",
      when_to_use:
        "当你的邮件被判定为垃圾邮件被拒收时。\nISP / 云服务商更换 IP 后复查。\n将日志中的可疑 IP 与 Spamhaus 比对。",
      limits:
        "'干净' 的 IP 并不保证安全 — 部分列表是私有的。\n由于 DNSBL TTL 缓存，列入可能延迟显示。",
    },
  },

  "cdn-detector": {
    de: {
      purpose:
        "Die CDN-Erkennung identifiziert welches Content-Delivery-Network eine Domain nutzt — Cloudflare, Fastly, Akamai, CloudFront, Vercel, Netlify u.v.m. Wichtig fuer Performance-Analyse, Pentest-Vorbereitung und Konkurrenz-Recherche.",
      how_it_works:
        "Mehrere Signale werden kombiniert: HTTP-Header (Server, X-Cache, Via), CNAME-Ziel, IP-WHOIS.\nJedes CDN hat eindeutige Fingerprints, die unsere Datenbank kennt.\nMehrfach-CDN-Setups (z. B. Cloudflare vor Fastly) werden erkannt.",
      when_to_use:
        "Performance-Analyse: welcher CDN-Provider liefert die Site aus?\nVor Pentest: WAF-Anbieter (Cloudflare, Imperva) identifizieren.\nKonkurrenz-Tech-Stack analysieren.",
      limits:
        "Manche CDNs verschleiern ihre Identitaet (custom CNAMEs, generic Headers).\nNur die aeusserste Schicht ist sichtbar — Origin-Server bleibt versteckt.",
    },
    en: {
      purpose:
        "CDN Detector identifies which content-delivery network a domain uses — Cloudflare, Fastly, Akamai, CloudFront, Vercel, Netlify and more. Useful for performance analysis, pentest reconnaissance, and competitor research.",
      how_it_works:
        "Multiple signals are combined: HTTP headers (Server, X-Cache, Via), CNAME target, IP WHOIS.\nEach CDN has unique fingerprints our database recognises.\nMulti-layer setups (e.g. Cloudflare in front of Fastly) are detected.",
      when_to_use:
        "Performance analysis: which CDN serves the site?\nBefore a pentest: identify the WAF (Cloudflare, Imperva).\nAnalyse a competitor's tech stack.",
      limits:
        "Some CDNs obscure their identity (custom CNAMEs, generic headers).\nOnly the outermost layer is visible — origin server stays hidden.",
    },
    hi: {
      purpose:
        "CDN डिटेक्टर पहचानता है कि कोई डोमेन कौन-सा CDN उपयोग कर रहा है — Cloudflare, Fastly, Akamai, CloudFront, Vercel, Netlify आदि। प्रदर्शन विश्लेषण और सुरक्षा परीक्षण के लिए उपयोगी।",
      how_it_works:
        "कई संकेत संयोजित: HTTP हेडर, CNAME लक्ष्य, IP WHOIS।\nहमारा डेटाबेस प्रत्येक CDN की विशिष्ट फ़िंगरप्रिंट जानता है।\nबहु-परत सेटअप (Cloudflare आगे Fastly) का पता चलता है।",
      when_to_use:
        "प्रदर्शन विश्लेषण: कौन सा CDN सेवा देता है?\nपेंटेस्ट से पहले WAF पहचानें (Cloudflare, Imperva)।\nप्रतियोगी की टेक स्टैक का विश्लेषण।",
      limits:
        "कुछ CDN अपनी पहचान छिपाते हैं।\nकेवल बाहरी परत दिखती है — मूल सर्वर छिपा रहता है।",
    },
    zh: {
      purpose:
        "CDN 检测识别域名使用的内容分发网络 — Cloudflare、Fastly、Akamai、CloudFront、Vercel、Netlify 等。对性能分析、渗透测试侦察和竞品研究有用。",
      how_it_works:
        "结合多种信号：HTTP 标头 (Server, X-Cache, Via)、CNAME 目标、IP WHOIS。\n我们的数据库识别每家 CDN 的独特指纹。\n可识别多层叠加 (例如 Cloudflare 前置 Fastly)。",
      when_to_use:
        "性能分析：站点由哪个 CDN 提供？\n渗透测试前识别 WAF (Cloudflare、Imperva)。\n分析竞争对手技术栈。",
      limits:
        "部分 CDN 会隐藏自身身份。\n仅可见最外层 — 源站仍被隐藏。",
    },
  },

  cookies: {
    de: {
      purpose:
        "Der Cookie- und GDPR-Analyzer laedt eine URL, listet alle gesetzten Cookies inklusive Sicherheits-Flags (Secure, HttpOnly, SameSite, Max-Age) und identifiziert Third-Party-Tracker. Hilft bei DSGVO-Compliance und Datenschutz-Audits.",
      how_it_works:
        "Browser-aehnliches Laden der Seite, alle Set-Cookie-Header werden eingesammelt.\nDritt-Domains (Tracker, Analytics, Werbe-Netze) werden gegen eine kuratierte Liste gemappt.\nFehlende Sicherheits-Flags werden mit Begruendung gemeldet.",
      when_to_use:
        "DSGVO-Audit der eigenen Website vor einer Anwaltspruefung.\nVerdaechtige Tracker auf Konkurrenz-Sites entdecken.\nFehlkonfiguration (HttpOnly fehlt, SameSite=None ohne Secure) finden.",
      limits:
        "Cookies die erst nach User-Interaktion (Consent-Banner) gesetzt werden, fehlen.\nKein vollstaendiger Browser — komplexe JS-getriebene Tracker entgehen evtl.",
    },
    en: {
      purpose:
        "Cookie & GDPR Analyzer loads a URL and lists every cookie set, including security flags (Secure, HttpOnly, SameSite, Max-Age) plus third-party trackers detected. Helps with GDPR compliance and privacy audits.",
      how_it_works:
        "Browser-like fetch collects every Set-Cookie header on the response.\nThird-party domains are mapped against a curated tracker / ads / analytics list.\nMissing security flags are reported with the reason they matter.",
      when_to_use:
        "GDPR audit your own site before a legal review.\nSpot suspicious trackers on competitor sites.\nFind misconfiguration (missing HttpOnly, SameSite=None without Secure).",
      limits:
        "Cookies set only after user interaction (consent banner) are missed.\nNot a full browser — complex JS-driven trackers may slip past.",
    },
    hi: {
      purpose:
        "कुकी और GDPR विश्लेषक URL लोड करता है, सभी सेट कुकीज़ को सुरक्षा फ़्लैग (Secure, HttpOnly, SameSite, Max-Age) के साथ सूचीबद्ध करता है और तृतीय-पक्ष ट्रैकर्स की पहचान करता है।",
      how_it_works:
        "ब्राउज़र-जैसा फ़ेच सभी Set-Cookie हेडर एकत्र करता है।\nतृतीय-पक्ष डोमेन क्यूरेटेड ट्रैकर सूची से मिलाए जाते हैं।\nलापता सुरक्षा फ़्लैग कारण के साथ रिपोर्ट किए जाते हैं।",
      when_to_use:
        "कानूनी समीक्षा से पहले अपनी साइट का GDPR ऑडिट।\nप्रतियोगी साइटों पर संदिग्ध ट्रैकर खोजें।\nग़लत कॉन्फ़िगरेशन ढूँढें।",
      limits:
        "उपयोगकर्ता इंटरैक्शन के बाद सेट होने वाली कुकीज़ छूट जाती हैं।\nपूर्ण ब्राउज़र नहीं — जटिल JS ट्रैकर बच सकते हैं।",
    },
    zh: {
      purpose:
        "Cookie / GDPR 分析器加载 URL，列出所有设置的 Cookie 及其安全标志 (Secure、HttpOnly、SameSite、Max-Age)，并识别第三方追踪器。有助于 GDPR 合规和隐私审计。",
      how_it_works:
        "类浏览器抓取，收集响应中的所有 Set-Cookie 标头。\n第三方域名与精选追踪器/广告/分析列表比对。\n报告缺失的安全标志及其重要性。",
      when_to_use:
        "法律审查前对自有站点做 GDPR 审计。\n发现竞品站点的可疑追踪器。\n找出错误配置 (缺 HttpOnly、SameSite=None 但无 Secure)。",
      limits:
        "用户交互后 (同意横幅) 才设置的 Cookie 不会被发现。\n非完整浏览器 — 复杂的 JS 驱动追踪器可能漏检。",
    },
  },

  "dns-propagation": {
    de: {
      purpose:
        "DNS-Ausbreitungs-Check fragt 15+ oeffentliche DNS-Resolver weltweit gleichzeitig nach demselben Record-Typ und vergleicht die Antworten. So siehst du ob deine DNS-Aenderung schon ueberall propagiert ist oder nur in einigen Regionen.",
      how_it_works:
        "Parallel-Anfragen an Cloudflare, Google, Quad9, OpenDNS, Yandex, NextDNS u.a.\nAlle Antworten werden mit Latenz-Wert tabelliert.\nAbweichende Antworten werden farblich hervorgehoben.",
      when_to_use:
        "Nach DNS-Aenderung pruefen ob sie weltweit aktiv ist (TTL abwarten).\nGeo-DNS / Anycast-Konfiguration verifizieren.\nDNS-Hijacking durch Resolver entdecken (selten aber moeglich).",
      limits:
        "Resolver cachen aggressiv — Aenderungen mit hohem TTL brauchen lange.\nNur oeffentliche Resolver — interne Firmen-DNS sind nicht abrufbar.",
    },
    en: {
      purpose:
        "DNS Propagation Check queries 15+ public DNS resolvers worldwide in parallel for the same record type and compares answers. Use it to see whether your DNS change has reached every corner of the Internet or only some regions.",
      how_it_works:
        "Parallel queries to Cloudflare, Google, Quad9, OpenDNS, Yandex, NextDNS and more.\nEvery answer is tabulated with its latency.\nDivergent answers are colour-highlighted.",
      when_to_use:
        "After a DNS change, verify it has propagated globally (respect TTL).\nValidate geo-DNS / anycast configuration.\nSpot resolver-level DNS hijacking (rare but possible).",
      limits:
        "Resolvers cache aggressively — high-TTL changes take a long time.\nPublic resolvers only — internal corporate DNS isn't accessible.",
    },
    hi: {
      purpose:
        "DNS प्रसार जाँच एक ही रिकॉर्ड प्रकार के लिए दुनिया भर के 15+ सार्वजनिक DNS रिज़ॉल्वर से समानांतर पूछताछ करती है और उत्तरों की तुलना करती है।",
      how_it_works:
        "Cloudflare, Google, Quad9, OpenDNS, Yandex आदि को समानांतर अनुरोध।\nप्रत्येक उत्तर लेटेंसी के साथ सूचीबद्ध।\nभिन्न उत्तर रंग से हाइलाइट।",
      when_to_use:
        "DNS परिवर्तन के बाद वैश्विक प्रसार सत्यापित करें।\nGeo-DNS / Anycast कॉन्फ़िगरेशन सत्यापित करें।\nरिज़ॉल्वर-स्तर DNS हाइजैकिंग का पता लगाएं।",
      limits:
        "रिज़ॉल्वर आक्रामक रूप से कैश करते हैं — उच्च TTL में देरी।\nकेवल सार्वजनिक रिज़ॉल्वर।",
    },
    zh: {
      purpose:
        "DNS 传播检查并行向全球 15+ 个公共 DNS 解析器查询同一记录类型并比较结果。可见 DNS 变更是否已传播到全球各地或仅部分地区。",
      how_it_works:
        "并行查询 Cloudflare、Google、Quad9、OpenDNS、Yandex、NextDNS 等。\n每个响应连同延迟一起列出。\n不同的应答以不同颜色标示。",
      when_to_use:
        "DNS 变更后验证全球传播 (注意 TTL)。\n验证 Geo-DNS / Anycast 配置。\n发现解析器层面的 DNS 劫持 (少见但可能)。",
      limits:
        "解析器缓存激进 — 高 TTL 变更需要很长时间。\n仅公共解析器 — 内部企业 DNS 不可访问。",
    },
  },

  dnssec: {
    de: {
      purpose:
        "DNSSEC-Validator prueft ob eine Domain DNSSEC korrekt deployed hat — DS-Records bei der Eltern-Zone, DNSKEY-Records, RRSIG-Signaturen und die Vertrauenskette bis zur Root-KSK. Schuetzt vor DNS-Spoofing und Cache-Poisoning.",
      how_it_works:
        "Vollstaendige DNSSEC-Resolution mit AD-Bit-Check.\nDS, DNSKEY, RRSIG werden einzeln gefetched und gegen Algorithm-Whitelist geprueft.\nFehlende oder schwache Algorithmen (RSA-MD5, SHA-1) werden gewarnt.",
      when_to_use:
        "Vor / nach DNSSEC-Aktivierung verifizieren dass Signaturen valide sind.\nKey-Rollover begleiten — alte und neue DNSKEYs muessen ueberlappen.\nRegistrar-Side DS-Eintragungs-Probleme diagnostizieren.",
      limits:
        "Liefert nur Validation-Status; reparieren musst du beim Registrar.\nKEINE Validierung von Subdomains die selbst signiert sind, ohne korrekten DS.",
    },
    en: {
      purpose:
        "DNSSEC Validator checks whether a domain has DNSSEC deployed correctly — DS records at the parent zone, DNSKEY records, RRSIG signatures and the chain of trust to the root KSK. Protects against DNS spoofing and cache poisoning.",
      how_it_works:
        "Full DNSSEC resolution with AD-bit verification.\nDS, DNSKEY and RRSIG are fetched individually and checked against an algorithm whitelist.\nMissing or weak algorithms (RSA-MD5, SHA-1) trigger warnings.",
      when_to_use:
        "Verify signatures are valid before / after enabling DNSSEC.\nMonitor key rollovers — old and new DNSKEYs must overlap.\nDiagnose registrar-side DS submission problems.",
      limits:
        "Only reports validation status; repairs are made at the registrar.\nDoes NOT validate subdomains self-signed without a parent DS.",
    },
    hi: {
      purpose:
        "DNSSEC सत्यापनकर्ता जाँचता है कि क्या डोमेन ने DNSSEC सही ढंग से तैनात किया है — माता-पिता ज़ोन में DS रिकॉर्ड, DNSKEY, RRSIG हस्ताक्षर और रूट KSK तक विश्वास की श्रृंखला।",
      how_it_works:
        "AD-bit सत्यापन के साथ पूर्ण DNSSEC रिज़ॉल्यूशन।\nDS, DNSKEY, RRSIG अलग-अलग लाए जाते हैं।\nलापता या कमज़ोर एल्गोरिदम के लिए चेतावनी।",
      when_to_use:
        "DNSSEC सक्षम करने से पहले / बाद में हस्ताक्षर सत्यापित करें।\nKey rollover मॉनिटर करें।\nरजिस्ट्रार-साइड DS समस्याओं का निदान।",
      limits:
        "केवल स्थिति की रिपोर्ट करता है; मरम्मत रजिस्ट्रार पर।\nपैरेंट DS के बिना स्व-हस्ताक्षरित सबडोमेन सत्यापित नहीं।",
    },
    zh: {
      purpose:
        "DNSSEC 验证器检查域名是否正确部署 DNSSEC — 父区的 DS 记录、DNSKEY、RRSIG 签名以及到根 KSK 的信任链。可防止 DNS 欺骗和缓存投毒。",
      how_it_works:
        "完整 DNSSEC 解析并验证 AD 位。\n分别获取 DS、DNSKEY、RRSIG 并与算法白名单比对。\n缺失或弱算法 (RSA-MD5、SHA-1) 会触发警告。",
      when_to_use:
        "启用 DNSSEC 前 / 后验证签名有效。\n监控密钥轮换 — 旧密钥和新密钥需要重叠。\n诊断注册商侧 DS 提交问题。",
      limits:
        "仅报告验证状态；修复需在注册商完成。\n不验证父级缺少 DS 的自签名子域名。",
    },
  },

  "email-auth": {
    de: {
      purpose:
        "SPF / DKIM / DMARC-Analyse prueft die E-Mail-Authentifizierung einer Domain — drei Standards die zusammen verhindern dass Angreifer im Namen deiner Domain Mails senden (Spoofing, Phishing). Liefert eine Bewertung mit konkreten Verbesserungsvorschlaegen.",
      how_it_works:
        "Liest TXT-Records: v=spf1, _dmarc.<domain>, default._domainkey.<domain>.\nSPF wird gegen Cycle-Limit (10 Lookups) geprueft, DMARC gegen p= und rua=.\nDKIM-Selektoren werden mit Standardnamen probiert (default, google, mail).",
      when_to_use:
        "Audit der eigenen Mail-Authentifizierung vor wichtigem Newsletter-Versand.\nNach Einrichtung pruefen dass DMARC enforcement (p=quarantine/reject) wirkt.\nSpoofing-Probleme bei Kunden-Domains diagnostizieren.",
      limits:
        "DKIM-Selektor-Erkennung ist heuristisch; Custom-Selektoren werden ggf. nicht gefunden.\nKein Test einzelner Mail-Versand-Pfade — nur die Konfiguration wird gemessen.",
    },
    en: {
      purpose:
        "SPF / DKIM / DMARC Analyzer audits a domain's email authentication — three standards that together prevent attackers from sending mail in your name (spoofing, phishing). Outputs a grade with concrete improvement suggestions.",
      how_it_works:
        "Reads TXT records: v=spf1, _dmarc.<domain>, default._domainkey.<domain>.\nSPF is checked against the 10-lookup limit; DMARC for p= and rua=.\nDKIM selectors are probed with common names (default, google, mail).",
      when_to_use:
        "Audit your own mail authentication before a critical newsletter campaign.\nVerify DMARC enforcement (p=quarantine/reject) is in effect after setup.\nDiagnose spoofing problems on customer domains.",
      limits:
        "DKIM-selector detection is heuristic; custom selectors may be missed.\nDoes not test actual send paths — only configuration is graded.",
    },
    hi: {
      purpose:
        "SPF / DKIM / DMARC विश्लेषक डोमेन के ईमेल प्रमाणीकरण का ऑडिट करता है — तीन मानक जो मिलकर हमलावरों को आपके नाम पर मेल भेजने से रोकते हैं।",
      how_it_works:
        "TXT रिकॉर्ड पढ़े जाते हैं: v=spf1, _dmarc, default._domainkey।\nSPF 10-लुकअप सीमा के विरुद्ध जाँचा जाता है।\nDKIM सेलेक्टर सामान्य नामों से खोजे जाते हैं।",
      when_to_use:
        "महत्वपूर्ण न्यूज़लेटर से पहले मेल प्रमाणीकरण ऑडिट।\nसेटअप के बाद DMARC प्रवर्तन सत्यापित करें।\nग्राहक डोमेन की स्पूफ़िंग समस्याओं का निदान।",
      limits:
        "DKIM सेलेक्टर पहचान heuristic है।\nवास्तविक भेजने का परीक्षण नहीं — केवल कॉन्फ़िग।",
    },
    zh: {
      purpose:
        "SPF / DKIM / DMARC 分析器审计域名的邮件身份验证 — 三项标准共同防止攻击者以您的名义发送邮件 (欺骗、钓鱼)。输出评级与具体改进建议。",
      how_it_works:
        "读取 TXT 记录：v=spf1、_dmarc.<域>、default._domainkey.<域>。\nSPF 检查 10 次查询上限；DMARC 检查 p= 和 rua=。\nDKIM 选择器尝试常见名称 (default、google、mail)。",
      when_to_use:
        "重要邮件营销前审计自有邮件身份验证。\n部署后验证 DMARC 强制执行 (p=quarantine/reject) 已生效。\n诊断客户域名的欺骗问题。",
      limits:
        "DKIM 选择器检测为启发式；自定义选择器可能漏检。\n不测试实际发送路径 — 仅评估配置。",
    },
  },

  ipv6: {
    de: {
      purpose:
        "IPv6-Readiness-Score bewertet wie gut eine Domain auf IPv6 vorbereitet ist — Apex (example.com), www, Nameserver und MX-Server werden alle einzeln auf AAAA-Eintraege geprueft. Wichtig fuer mobile Netze und IPv6-Compliance bei Behoerden / Telcos.",
      how_it_works:
        "Vier Layer werden geprueft: apex AAAA, www AAAA, NS AAAA, MX AAAA.\nJede vorhandene Schicht gibt 25 Punkte; Score von 0–100.\nFehlende Schichten werden mit Fix-Hinweis annotiert.",
      when_to_use:
        "Vor IPv6-Migration den Status quo dokumentieren.\nBehoerden-/Compliance-Audits (BSI Mindeststandard, US Federal IPv6).\nPriorisierung welche Schicht zuerst IPv6-faehig gemacht werden sollte.",
      limits:
        "Wertet nur DNS-Existenz, kein Reachability-Test der IPv6-Adresse.\nWildcard-AAAA wird zwar gefunden, aber nicht als 'echte' Bereitschaft gewertet.",
    },
    en: {
      purpose:
        "IPv6 Readiness Score grades how well a domain is prepared for IPv6 — apex (example.com), www, name servers and MX servers are each checked for AAAA records. Important for mobile networks and IPv6 compliance with governments / telcos.",
      how_it_works:
        "Four layers are checked: apex AAAA, www AAAA, NS AAAA, MX AAAA.\nEach present layer scores 25 points; total ranges 0–100.\nMissing layers are annotated with a fix hint.",
      when_to_use:
        "Document the status quo before an IPv6 migration.\nGovernment / compliance audits (BSI baseline, US Federal IPv6).\nPrioritise which layer to make IPv6-ready first.",
      limits:
        "Only checks DNS existence, not actual IPv6 reachability.\nWildcard AAAAs are found but not credited as 'real' readiness.",
    },
    hi: {
      purpose:
        "IPv6 तैयारी स्कोर मूल्यांकन करता है कि कोई डोमेन IPv6 के लिए कितना तैयार है — apex, www, नेमसर्वर और MX सर्वर सभी AAAA रिकॉर्ड के लिए जाँचे जाते हैं।",
      how_it_works:
        "चार परतें: apex AAAA, www AAAA, NS AAAA, MX AAAA।\nप्रत्येक उपस्थित परत 25 अंक देती है; कुल 0–100।\nअनुपस्थित परतों के लिए सुधार संकेत।",
      when_to_use:
        "IPv6 माइग्रेशन से पहले स्थिति का दस्तावेज़ीकरण।\nसरकारी / अनुपालन ऑडिट।\nप्राथमिकता तय करें।",
      limits:
        "केवल DNS अस्तित्व जाँचता है, वास्तविक पहुँच नहीं।\nWildcard AAAA को 'वास्तविक' तैयारी नहीं माना जाता।",
    },
    zh: {
      purpose:
        "IPv6 就绪度评分评估域名为 IPv6 做了多少准备 — apex (example.com)、www、名称服务器和 MX 服务器分别检查 AAAA 记录。对移动网络和政府/电信合规很重要。",
      how_it_works:
        "检查四层：apex AAAA、www AAAA、NS AAAA、MX AAAA。\n每个存在的层得 25 分；总分 0–100。\n缺失的层附带修复提示。",
      when_to_use:
        "IPv6 迁移前记录现状。\n政府 / 合规审计。\n优先决定哪一层先 IPv6 化。",
      limits:
        "只检查 DNS 存在，不测试 IPv6 实际可达性。\n通配符 AAAA 不计为 '真正的' 就绪。",
    },
  },

  jwt: {
    de: {
      purpose:
        "Der JWT-Decoder entschluesselt JSON Web Tokens (Header + Payload) und zeigt die Claims (sub, exp, iat, iss, aud …) lesbar an. Funktioniert komplett im Browser — der Token verlaesst dein Geraet niemals und wird nicht an Server gesendet.",
      how_it_works:
        "Token wird an den zwei Punkten in drei base64url-Teile geteilt.\nHeader und Payload werden client-seitig dekodiert.\nAblaufzeit (exp) wird gegen die aktuelle Zeit verglichen und visualisiert.",
      when_to_use:
        "Beim Debuggen von Auth-Fluessen in eigenen Apps Claims pruefen.\nKunden-Token analysieren ohne Sicherheitsbedenken (nichts geht raus).\nAblauf eines Refresh-Tokens schnell ueberpruefen.",
      limits:
        "Verifiziert NICHT die Signatur — du brauchst dafuer den Public Key des Issuers.\nNur JWS (signed JWTs); JWE (encrypted) wird nicht entschluesselt.",
    },
    en: {
      purpose:
        "JWT Decoder decodes JSON Web Tokens (header + payload) and shows claims (sub, exp, iat, iss, aud …) in human-readable form. Runs entirely in the browser — your token never leaves the device and is not sent to any server.",
      how_it_works:
        "The token is split on the two dots into three base64url segments.\nHeader and payload are decoded client-side.\nExpiry (exp) is compared against current time and visualised.",
      when_to_use:
        "Inspect claims while debugging auth flows in your own apps.\nAnalyse a customer's token without privacy worries (nothing leaves the page).\nQuick check whether a refresh token has expired.",
      limits:
        "Does NOT verify the signature — you need the issuer's public key for that.\nOnly JWS (signed JWTs); JWE (encrypted) is not decrypted.",
    },
    hi: {
      purpose:
        "JWT डिकोडर JSON Web Tokens (हेडर + पेलोड) को डिकोड करता है और claims को पठनीय रूप में दिखाता है। पूरी तरह ब्राउज़र में चलता है — टोकन कहीं नहीं भेजा जाता।",
      how_it_works:
        "टोकन को दो डॉट पर तीन base64url भागों में बाँटा जाता है।\nहेडर और पेलोड क्लाइंट-साइड डिकोड होते हैं।\nसमाप्ति (exp) वर्तमान समय से तुलना की जाती है।",
      when_to_use:
        "Auth प्रवाह डीबग करते समय claims जाँचें।\nग्राहक का टोकन निजता की चिंता के बिना देखें।\nRefresh टोकन की समाप्ति त्वरित जाँच।",
      limits:
        "हस्ताक्षर सत्यापित नहीं करता।\nकेवल JWS; JWE डिक्रिप्ट नहीं।",
    },
    zh: {
      purpose:
        "JWT 解码器解码 JSON Web Tokens (头部 + 负载)，以可读形式显示 claims (sub、exp、iat、iss、aud 等)。完全在浏览器中运行 — 您的 token 不会离开设备，不会发送到任何服务器。",
      how_it_works:
        "在两个点处将 token 拆为三段 base64url。\n头部和负载在客户端解码。\n过期时间 (exp) 与当前时间比较并可视化。",
      when_to_use:
        "调试自有应用的认证流时检查 claims。\n无隐私顾虑分析客户的 token (不会离开页面)。\n快速检查刷新令牌是否过期。",
      limits:
        "不验证签名 — 需要颁发者的公钥。\n仅 JWS (签名 JWT)；JWE (加密) 不解密。",
    },
  },

  "mixed-content": {
    de: {
      purpose:
        "Mixed-Content-Scan findet auf einer HTTPS-Seite eingebettete http://-Ressourcen (Bilder, Scripts, iframes, Fonts), die der Browser entweder blockiert oder vor denen er warnt. Diese Mixed-Content-Probleme verursachen kaputte Layouts, fehlende Bilder und Sicherheits-Warnungen.",
      how_it_works:
        "Server laedt das HTML und parst alle src-/href-Attribute.\nJede http://-URL wird klassifiziert: blocking (Scripts, iframes) oder warning (Bilder, Fonts).\nAuch CSS-imports und @font-face werden untersucht.",
      when_to_use:
        "Vor dem HTTPS-Migrate eines Legacy-Backends pruefen welche Ressourcen umgestellt werden muessen.\nNach 3rd-Party-Plugin-Installation pruefen ob es http-Calls einschleust.\nGoogle-Search-Console-Warnungen reproduzieren.",
      limits:
        "Statisches HTML — JS-injizierte http-Ressourcen werden nicht gefunden.\nNur die Erst-Ebene; iframes werden nicht weiterverfolgt.",
    },
    en: {
      purpose:
        "Mixed Content Scan finds http:// resources embedded on an HTTPS page (images, scripts, iframes, fonts) — which browsers either block outright or warn about. These cause broken layouts, missing images, and security warnings.",
      how_it_works:
        "The server loads the HTML and parses every src / href attribute.\nEach http:// URL is classified: blocking (scripts, iframes) or warning (images, fonts).\nCSS imports and @font-face declarations are also inspected.",
      when_to_use:
        "Before migrating a legacy backend to HTTPS, find which resources need updating.\nAfter installing a third-party plugin, check whether it injects http calls.\nReproduce Google Search Console warnings.",
      limits:
        "Static HTML only — JS-injected http resources aren't found.\nFirst level only; iframes are not followed.",
    },
    hi: {
      purpose:
        "Mixed Content स्कैन HTTPS पेज पर एम्बेडेड http:// संसाधन (छवियाँ, स्क्रिप्ट, iframe, फ़ॉन्ट) ढूँढता है — जिन्हें ब्राउज़र अवरुद्ध करते हैं या चेतावनी देते हैं।",
      how_it_works:
        "सर्वर HTML लोड करता है और हर src/href विशेषता पार्स करता है।\nप्रत्येक http:// URL वर्गीकृत: blocking या warning।\nCSS imports और @font-face भी जाँचे जाते हैं।",
      when_to_use:
        "लीगेसी बैकएंड को HTTPS पर माइग्रेट करने से पहले।\n3rd-पार्टी प्लगइन के बाद http कॉल जाँचें।\nGoogle Search Console चेतावनियाँ पुन: उत्पन्न करें।",
      limits:
        "केवल स्थिर HTML — JS-इंजेक्टेड संसाधन नहीं मिलते।\nपहला स्तर; iframe फ़ॉलो नहीं।",
    },
    zh: {
      purpose:
        "混合内容扫描查找 HTTPS 页面中嵌入的 http:// 资源 (图片、脚本、iframe、字体) — 浏览器要么直接阻止要么发出警告。这些问题导致布局损坏、图片缺失和安全警告。",
      how_it_works:
        "服务器加载 HTML 并解析所有 src/href 属性。\n每个 http:// URL 被分类为 blocking (脚本、iframe) 或 warning (图片、字体)。\n也检查 CSS imports 和 @font-face 声明。",
      when_to_use:
        "将遗留后端迁移到 HTTPS 前找出需更新的资源。\n安装第三方插件后检查是否注入了 http 调用。\n复现 Google Search Console 警告。",
      limits:
        "仅静态 HTML — JS 注入的 http 资源找不到。\n仅第一层；iframe 不递归。",
    },
  },

  opengraph: {
    de: {
      purpose:
        "Open-Graph- und Meta-Vorschau zeigt wie deine URL beim Teilen auf Twitter/X, Facebook, LinkedIn, Slack, Discord aussehen wird. Praktisch um Open-Graph-Tags zu debuggen bevor du etwas postest.",
      how_it_works:
        "Server laedt das HTML und parst alle og:- und twitter:-Meta-Tags.\nFehlende essentielle Tags (og:title, og:image, og:description) werden gemeldet.\nVorschau-Karten fuer mehrere Plattformen werden simuliert.",
      when_to_use:
        "Vor dem Veroeffentlichen eines wichtigen Posts die Vorschau testen.\nDebugging warum Twitter / Facebook keine Image-Card anzeigen.\nAlle Seiten einer Website auf konsistente OG-Tags pruefen.",
      limits:
        "Nur Server-rendered Tags — JS-Apps die OG via JS setzen werden nicht ausgewertet.\nEchte Plattform-Crawler benutzen Caches; Aenderungen brauchen evtl. Re-Scrape.",
    },
    en: {
      purpose:
        "OpenGraph & Meta Preview shows how your URL will look when shared on Twitter/X, Facebook, LinkedIn, Slack and Discord. Handy for debugging OG tags before you post.",
      how_it_works:
        "Server fetches the HTML and parses every og: and twitter: meta tag.\nMissing essential tags (og:title, og:image, og:description) are reported.\nPreview cards for multiple platforms are simulated.",
      when_to_use:
        "Test the preview before publishing an important post.\nDebug why Twitter / Facebook doesn't show an image card.\nAudit a whole site for consistent OG tags.",
      limits:
        "Server-rendered tags only — JS apps setting OG client-side aren't evaluated.\nReal platform crawlers cache; changes may need a re-scrape.",
    },
    hi: {
      purpose:
        "OpenGraph / मेटा पूर्वावलोकन दिखाता है कि आपका URL Twitter/X, Facebook, LinkedIn, Slack, Discord पर साझा करने पर कैसा दिखेगा।",
      how_it_works:
        "सर्वर HTML लाता है और सभी og: / twitter: मेटा टैग पार्स करता है।\nलापता आवश्यक टैग (og:title, og:image, og:description) रिपोर्ट किए जाते हैं।\nकई प्लेटफ़ॉर्म के लिए पूर्वावलोकन कार्ड सिमुलेट किए जाते हैं।",
      when_to_use:
        "महत्वपूर्ण पोस्ट प्रकाशित करने से पहले पूर्वावलोकन परीक्षण।\nTwitter/Facebook कार्ड न दिखने के कारणों का पता लगाएं।\nपूरी साइट के OG टैग की संगति जाँचें।",
      limits:
        "केवल सर्वर-रेंडर्ड टैग।\nप्लेटफ़ॉर्म कैश करते हैं — पुन: स्क्रैप आवश्यक हो सकता है।",
    },
    zh: {
      purpose:
        "Open Graph 与元数据预览显示您的 URL 在 Twitter/X、Facebook、LinkedIn、Slack、Discord 分享时的外观。便于在发布前调试 OG 标签。",
      how_it_works:
        "服务器获取 HTML 并解析所有 og: 和 twitter: 元标签。\n报告缺失的必要标签 (og:title、og:image、og:description)。\n模拟多个平台的预览卡片。",
      when_to_use:
        "重要帖子发布前测试预览效果。\n调试 Twitter/Facebook 不显示图片卡片的原因。\n审计整个站点的 OG 标签一致性。",
      limits:
        "仅服务器渲染的标签 — JS 设置的 OG 不评估。\n真实平台爬虫会缓存；变更可能需要重新抓取。",
    },
  },

  "password-leak": {
    de: {
      purpose:
        "Passwort-Leak-Check prueft ob dein Passwort in einem bekannten Datenleck (3 Mrd+ Eintraege) auftaucht. Nutzt die k-Anonymitaets-API von Have I Been Pwned — nur die ersten 5 Zeichen des SHA-1-Hashs werden gesendet, dein Passwort verlaesst nie deinen Browser.",
      how_it_works:
        "SHA-1 des Passworts wird im Browser berechnet.\nNur die ersten 5 Zeichen des Hashs gehen an api.pwnedpasswords.com.\nServer liefert ALLE Hashes mit diesem Praefix; Vergleich findet client-seitig statt.",
      when_to_use:
        "Vor Verwendung eines neuen Passworts pruefen.\nAlte Passwoerter durchforsten ob welche kompromittiert sind.\nSecurity-Awareness-Training (zeige live wie viele Leaks ein schwaches PW hat).",
      limits:
        "Pruet nur Hash-Match — Variationen (Pa$$word vs password) werden separat behandelt.\nKein Zero-Days-Schutz; gemeldete Leaks koennen Monate alt sein.",
    },
    en: {
      purpose:
        "Password Leak Check tells you whether your password appears in known breaches (3B+ entries). Uses Have I Been Pwned's k-anonymity API — only the first 5 characters of the SHA-1 hash are sent, your password never leaves the browser.",
      how_it_works:
        "SHA-1 of the password is computed in the browser.\nOnly the first 5 hash characters are sent to api.pwnedpasswords.com.\nServer returns ALL hashes with that prefix; comparison happens client-side.",
      when_to_use:
        "Check a new password before adopting it.\nAudit old passwords for compromise.\nSecurity-awareness training (live demo of breach count).",
      limits:
        "Hash match only — variants (Pa$$word vs password) hash separately.\nNo zero-day coverage; reported breaches can be months old.",
    },
    hi: {
      purpose:
        "पासवर्ड लीक जाँच बताती है कि क्या आपका पासवर्ड ज्ञात उल्लंघनों (3B+) में दिखाई देता है। Have I Been Pwned की k-Anonymity API का उपयोग करता है — केवल SHA-1 के पहले 5 अक्षर भेजे जाते हैं।",
      how_it_works:
        "ब्राउज़र में पासवर्ड का SHA-1 गणना।\nकेवल पहले 5 अक्षर api.pwnedpasswords.com को भेजे जाते हैं।\nसर्वर उस उपसर्ग वाले सभी hashes लौटाता है; तुलना क्लाइंट पर।",
      when_to_use:
        "नए पासवर्ड को अपनाने से पहले जाँच।\nपुराने पासवर्ड की समझौता-स्थिति ऑडिट।\nसुरक्षा जागरूकता प्रशिक्षण।",
      limits:
        "केवल hash मिलान — variants अलग hash होते हैं।\nशून्य-दिवस कवरेज नहीं।",
    },
    zh: {
      purpose:
        "密码泄露检查告诉您密码是否出现在已知数据泄露 (30 亿+ 条目) 中。使用 Have I Been Pwned 的 k-Anonymity API — 仅发送 SHA-1 哈希的前 5 个字符，您的密码永不离开浏览器。",
      how_it_works:
        "浏览器中计算密码的 SHA-1。\n仅前 5 个哈希字符发送到 api.pwnedpasswords.com。\n服务器返回该前缀下所有哈希；比较在客户端完成。",
      when_to_use:
        "在采用新密码前检查。\n审计旧密码是否被泄露。\n安全意识培训 (实时演示泄露数量)。",
      limits:
        "仅哈希匹配 — 变体 (Pa$$word vs password) 哈希不同。\n无零日覆盖；已报泄露可能已是数月前。",
    },
  },

  reachability: {
    de: {
      purpose:
        "Erreichbarkeits-Test prueft drei Schichten gleichzeitig: HTTP-Antwort, TCP-Connect und ICMP-Ping. Damit erkennst du ob ein Server komplett offline ist, nur den Web-Dienst hat oder ob die Firewall ICMP filtert.",
      how_it_works:
        "Drei parallele Tests vom Server aus: ping, TCP-connect, HTTP-GET.\nLatenz wird je Schicht gemessen.\nKurze Status-Codes (DNS-Fehler, Timeout, refused) werden uebersetzt.",
      when_to_use:
        "Schnelle Verfuegbarkeitsdiagnose ohne SSH ins Datacenter.\nUnterscheiden ob Internet-Routing kaputt ist oder nur die App down ist.\nPing-Filter-Erkennung — viele Cloud-Provider blocken ICMP.",
      limits:
        "Pruefung von einem Server-Standort — fuer globale Sicht braucht es mehrere Probes.\nKeine kontinuierliche Beobachtung; nur ein Snapshot.",
    },
    en: {
      purpose:
        "Reachability Test probes three layers in parallel: HTTP response, TCP connect, and ICMP ping. You can tell whether a server is fully offline, only the web service is down, or the firewall is filtering ICMP.",
      how_it_works:
        "Three parallel probes from the server: ping, TCP connect, HTTP GET.\nLatency is measured per layer.\nShort status codes (DNS error, timeout, refused) are translated to English.",
      when_to_use:
        "Quick availability diagnosis without SSH into the data centre.\nTell apart 'internet routing is broken' from 'only the app is down'.\nDetect ICMP filtering — many cloud providers block pings.",
      limits:
        "Tested from one server location — for a global view you need multiple probes.\nNo continuous observation; only a snapshot.",
    },
    hi: {
      purpose:
        "पहुँच परीक्षण समानांतर रूप से तीन परतों की जाँच करता है: HTTP प्रतिक्रिया, TCP कनेक्ट और ICMP ping। आप जान सकते हैं कि सर्वर पूरी तरह ऑफ़लाइन है, केवल वेब सेवा डाउन है, या फ़ायरवॉल ICMP फ़िल्टर कर रहा है।",
      how_it_works:
        "सर्वर से तीन समानांतर परीक्षण: ping, TCP-connect, HTTP-GET।\nप्रत्येक परत के लिए लेटेंसी मापी जाती है।\nत्रुटि कोड पठनीय रूप में अनुवादित।",
      when_to_use:
        "डेटा सेंटर में SSH के बिना शीघ्र उपलब्धता निदान।\nइंटरनेट रूटिंग या केवल ऐप के डाउन होने का अंतर बताएं।\nICMP फ़िल्टरिंग का पता लगाएं।",
      limits:
        "एक सर्वर स्थान से परीक्षण।\nनिरंतर अवलोकन नहीं।",
    },
    zh: {
      purpose:
        "可达性测试并行探测三层：HTTP 响应、TCP 连接、ICMP ping。可判断服务器是完全离线、仅 Web 服务下线，还是防火墙过滤 ICMP。",
      how_it_works:
        "从服务器并行三项探测：ping、TCP connect、HTTP GET。\n按层测量延迟。\n短状态码 (DNS 错误、超时、拒绝) 转换为可读文字。",
      when_to_use:
        "无需 SSH 即可快速诊断可用性。\n区分 '互联网路由故障' 与 '仅应用下线'。\n检测 ICMP 过滤 — 许多云服务商屏蔽 ping。",
      limits:
        "从单个服务器位置测试 — 全球视角需多个探针。\n非持续观测；仅快照。",
    },
  },

  redirects: {
    de: {
      purpose:
        "Redirect-Tracer verfolgt eine URL durch jeden HTTP-Redirect-Hop und protokolliert Status-Code, Ziel-URL und Latenz. So erkennst du Schleifen, HTTPS-Downgrades und zu viele Redirects, die SEO und Performance schaden.",
      how_it_works:
        "Server folgt manuell jedem 3xx-Redirect bis zur finalen 2xx-Antwort.\nMaximal 20 Hops um Endlos-Schleifen zu stoppen.\nProtokoll- und Host-Wechsel werden visuell hervorgehoben.",
      when_to_use:
        "Site-Migration: pruefen dass alte URLs korrekt zur neuen Struktur weiterleiten.\nSEO-Diagnose: Google straft Ketten mit 4+ Hops ab.\nSecurity-Audit: HTTP→HTTPS-Downgrades als XSS-Vektor erkennen.",
      limits:
        "Folgt nur Server-3xx — JS-basierte (window.location) oder Meta-Refresh werden nicht erkannt.\nCookie-abhaengige Redirects (login-walls) brechen ab.",
    },
    en: {
      purpose:
        "Redirect Tracer follows a URL through every HTTP redirect hop, logging status code, target URL and latency. Spot loops, HTTPS downgrades, and too-many-redirects that hurt SEO and performance.",
      how_it_works:
        "The server manually follows every 3xx until a final 2xx response.\nA hard cap of 20 hops prevents infinite loops.\nProtocol and host changes are visually highlighted.",
      when_to_use:
        "Site migration: verify old URLs redirect correctly to the new structure.\nSEO audit: Google penalises chains with 4+ hops.\nSecurity audit: detect HTTP→HTTPS downgrades as an XSS vector.",
      limits:
        "Follows server 3xx only — JS-based (window.location) or meta-refresh aren't detected.\nCookie-gated redirects (login walls) hit a wall.",
    },
    hi: {
      purpose:
        "रीडायरेक्ट ट्रेसर URL को हर HTTP रीडायरेक्ट हॉप के माध्यम से ट्रेस करता है और स्थिति कोड, लक्ष्य URL, लेटेंसी लॉग करता है। SEO और प्रदर्शन को नुकसान पहुँचाने वाले लूप और डाउनग्रेड खोजें।",
      how_it_works:
        "सर्वर अंतिम 2xx तक हर 3xx रीडायरेक्ट का पीछा करता है।\nअनंत लूप रोकने के लिए 20 हॉप सीमा।\nप्रोटोकॉल / होस्ट परिवर्तन हाइलाइट किए जाते हैं।",
      when_to_use:
        "साइट माइग्रेशन: पुराने URL सही दिशा में जा रहे हैं या नहीं।\nSEO ऑडिट: Google 4+ हॉप वाली श्रृंखलाओं को दंडित करता है।\nसुरक्षा ऑडिट: HTTP→HTTPS डाउनग्रेड का पता लगाएं।",
      limits:
        "केवल सर्वर 3xx का अनुसरण।\nलॉगिन-वॉल टूट जाती हैं।",
    },
    zh: {
      purpose:
        "重定向追踪器跟踪 URL 的每一跳 HTTP 重定向，记录状态码、目标 URL 和延迟。发现循环、HTTPS 降级和损害 SEO 与性能的过多重定向。",
      how_it_works:
        "服务器手动跟随每个 3xx 直到最终 2xx 响应。\n硬上限 20 跳防止无限循环。\n协议和主机变化在视觉上高亮。",
      when_to_use:
        "站点迁移：验证旧 URL 正确指向新结构。\nSEO 审计：Google 对 4+ 跳链路降权。\n安全审计：识别 HTTP→HTTPS 降级作为 XSS 向量。",
      limits:
        "只跟随服务器 3xx — JS (window.location) 或 meta-refresh 不识别。\n依赖 Cookie 的重定向 (登录墙) 会中断。",
    },
  },

  robots: {
    de: {
      purpose:
        "Robots.txt- und Sitemap-Validator parst die robots.txt einer Domain, listet alle Allow/Disallow-Regeln nach User-Agent gruppiert und validiert verlinkte Sitemap-XMLs gegen das Schema. Wichtig fuer Crawl-Budget-Management und SEO.",
      how_it_works:
        "robots.txt wird nach RFC 9309 geparst, jede Zeile syntaktisch geprueft.\nSitemap-URLs werden geladen und auf gueltiges XML validiert.\nWidersprueche (Sitemap blockiert von robots.txt!) werden gemeldet.",
      when_to_use:
        "Vor Site-Launch sicherstellen dass Suchmaschinen das Richtige indexieren.\nKonkurrenz-robots.txt analysieren (was sperren sie aus?).\nDebug warum Google Search Console Seiten als 'blockiert' meldet.",
      limits:
        "Nur Syntax-Validation — wir testen nicht ob Crawler die Regeln tatsaechlich respektieren.\nKein vollstaendiger Sitemap-Crawl; nur das Top-Level wird validiert.",
    },
    en: {
      purpose:
        "Robots.txt & Sitemap Validator parses a domain's robots.txt, groups all Allow/Disallow rules by user agent, and validates linked sitemap XMLs against the schema. Important for crawl-budget management and SEO.",
      how_it_works:
        "robots.txt is parsed per RFC 9309; every line is syntax-checked.\nSitemap URLs are fetched and validated as well-formed XML.\nContradictions (sitemap blocked by robots.txt!) are flagged.",
      when_to_use:
        "Before launch, verify search engines index the right things.\nAnalyse a competitor's robots.txt (what are they blocking?).\nDebug why Google Search Console reports pages as 'blocked'.",
      limits:
        "Syntax validation only — we don't test whether crawlers actually respect the rules.\nNo deep sitemap crawl; only the top-level XML is validated.",
    },
    hi: {
      purpose:
        "Robots.txt और Sitemap सत्यापनकर्ता डोमेन के robots.txt को पार्स करता है, उपयोगकर्ता-एजेंट के अनुसार सभी Allow/Disallow नियमों को समूहबद्ध करता है और लिंक किए गए साइटमैप XML को मान्य करता है।",
      how_it_works:
        "robots.txt को RFC 9309 के अनुसार पार्स किया जाता है।\nSitemap URLs लाए जाते हैं और well-formed XML के रूप में सत्यापित।\nविरोधाभास (sitemap robots.txt द्वारा अवरुद्ध) चिह्नित।",
      when_to_use:
        "लॉन्च से पहले सत्यापित करें कि सर्च इंजन सही चीज़ें इंडेक्स करते हैं।\nप्रतियोगी robots.txt का विश्लेषण।\nGoogle Search Console में 'blocked' पृष्ठों का डिबग।",
      limits:
        "केवल सिंटैक्स सत्यापन।\nगहरा साइटमैप क्रॉल नहीं।",
    },
    zh: {
      purpose:
        "Robots.txt 与站点地图验证器解析域名的 robots.txt，按用户代理分组所有 Allow/Disallow 规则，并将链接的 sitemap XML 与模式比对验证。对抓取预算管理和 SEO 很重要。",
      how_it_works:
        "按 RFC 9309 解析 robots.txt；每行做语法检查。\n获取 sitemap URL 并验证为格式良好的 XML。\n标记矛盾 (sitemap 被 robots.txt 屏蔽!)。",
      when_to_use:
        "上线前验证搜索引擎索引正确内容。\n分析竞品 robots.txt (他们屏蔽什么?)。\n调试 Google Search Console 报告 'blocked' 的原因。",
      limits:
        "仅语法验证 — 不测试爬虫是否真正遵守。\n不深度抓取 sitemap；仅验证顶层 XML。",
    },
  },

  "tech-stack": {
    de: {
      purpose:
        "Tech-Stack-Erkennung identifiziert Frameworks, CMS, Analytics, E-Commerce, Hosting und Bibliotheken einer Website aus oeffentlichen Antwortdaten — HTML-Markup, HTTP-Header, Cookie-Namen und JS-Globals. Beliebt fuer Konkurrenz-Recherche und Lead-Qualifizierung.",
      how_it_works:
        "HTML, Header und Cookies werden gegen 200+ bekannte Fingerprints abgeglichen.\nIndikatoren werden mit Confidence-Score gewichtet.\nMehrfach-Treffer in derselben Kategorie (z. B. 2 Analytics) werden gezeigt.",
      when_to_use:
        "Konkurrenz-Tech-Stack analysieren bevor du dich verkaufst.\nLead-Qualifizierung im B2B (Wer nutzt Shopify? Wer noch nicht?).\nDeprecation-Audit: laeuft die Site auf einer alten jQuery-Version?",
      limits:
        "Bot-geschuetzte Sites (Cloudflare-Challenge) liefern uns kein nutzbares HTML — leere Ergebnisse erwartet.\nClient-only-SPAs verraten ihren Stack erst nach JS-Ausfuehrung.",
    },
    en: {
      purpose:
        "Tech Stack Detector identifies frameworks, CMS, analytics, ecommerce, hosting and libraries from a site's public response data — HTML markup, HTTP headers, cookie names and JS globals. Popular for competitor research and lead qualification.",
      how_it_works:
        "HTML, headers and cookies are matched against 200+ known fingerprints.\nIndicators are weighted with a confidence score.\nMultiple hits in the same category (e.g. 2 analytics) are shown.",
      when_to_use:
        "Analyse a competitor's tech stack before pitching them.\nB2B lead qualification (who uses Shopify? who doesn't yet?).\nDeprecation audit: is this site running an ancient jQuery?",
      limits:
        "Bot-protected sites (Cloudflare challenge) return no usable HTML — empty results are expected.\nClient-only SPAs reveal their stack only after JS execution.",
    },
    hi: {
      purpose:
        "टेक स्टैक डिटेक्टर साइट की सार्वजनिक प्रतिक्रिया डेटा (HTML मार्कअप, HTTP हेडर, कुकी नाम, JS globals) से फ्रेमवर्क, CMS, analytics, ecommerce, hosting और लाइब्रेरी पहचानता है।",
      how_it_works:
        "HTML, हेडर और कुकीज़ 200+ ज्ञात फ़िंगरप्रिंट से मिलाए जाते हैं।\nसंकेत confidence स्कोर के साथ भारित होते हैं।\nएक ही श्रेणी में कई हिट दिखाए जाते हैं।",
      when_to_use:
        "प्रतियोगी की टेक स्टैक का विश्लेषण।\nB2B lead qualification।\nDeprecation ऑडिट।",
      limits:
        "बॉट-संरक्षित साइटें उपयोगी HTML नहीं देतीं।\nक्लाइंट-only SPA अपनी स्टैक JS निष्पादन के बाद ही प्रकट करते हैं।",
    },
    zh: {
      purpose:
        "技术栈检测从站点的公开响应数据 (HTML、HTTP 标头、Cookie 名称、JS globals) 识别框架、CMS、分析、电商、托管和库。常用于竞品研究和潜客资格筛选。",
      how_it_works:
        "HTML、标头和 Cookie 与 200+ 已知指纹比对。\n指标按置信度加权。\n同一类别多个命中 (例如 2 个分析工具) 都会显示。",
      when_to_use:
        "向竞争对手推销前分析其技术栈。\nB2B 潜客资格 (谁用 Shopify? 谁还未用?)。\n弃用审计：站点是否运行古老的 jQuery?",
      limits:
        "受 bot 保护的站点 (Cloudflare 挑战) 不返回可用 HTML — 预期为空结果。\n纯客户端 SPA 仅在 JS 执行后才显示技术栈。",
    },
  },
};

for (const locale of LOCALES) {
  const file = FILES[locale];
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!j.tools) j.tools = {};
  let count = 0;
  for (const [slug, perLocale] of Object.entries(E)) {
    const node = perLocale[locale];
    if (!node) continue;
    if (!j.tools[slug]) j.tools[slug] = {};
    j.tools[slug].explainer = node;
    count++;
  }
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
  console.log(`${locale}.json: explainer inserted for ${count} more tools`);
}
