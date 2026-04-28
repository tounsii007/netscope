/* eslint-disable */
// One-shot helper: inject `tools.<slug>.explainer.*` into each locale.
// Run with: node scripts/add-explainers.js
//
// Bullet-list fields use \n-separated entries (parsed by ToolExplainer's
// splitBullets()). Keep entries SHORT — they render as a 3-column grid on
// desktop and stack on mobile, so a one-line bullet is best.

const fs = require("fs");
const path = require("path");

const LOCALES = ["de", "en", "hi", "zh"];
const FILES = Object.fromEntries(
  LOCALES.map((l) => [l, path.join(__dirname, "..", "web", "messages", `${l}.json`)])
);

const E = {
  "port-checker": {
    de: {
      purpose:
        "Der Port-Checker testet, ob ein TCP-Port auf einem Host von außen erreichbar ist. Damit prüfst du Firewall-Regeln, Cloud-Security-Groups, lokale Dienste hinter NAT und Cloud-Provider-Routing — alles ohne SSH oder lokales nmap.",
      how_it_works:
        "Server öffnet eine TCP-Verbindung zum Ziel und meldet offen / geschlossen / Timeout.\nLatenz wird in Millisekunden gemessen, sodass du langsame Netzwerk-Hops erkennst.\nGängige Ports (21, 22, 80, 443, 3306, …) werden mit Diensthinweis annotiert.",
      when_to_use:
        "Nach dem Aufsetzen eines neuen Servers Firewall-Regeln verifizieren.\nKunden-Berichte \"kann nicht verbinden\" reproduzieren ohne deren Netz.\nVon außen prüfen ob ein Dienst öffentlich exponiert ist (Pentest-Vorab).",
      limits:
        "Nur TCP — UDP-Dienste wie DNS, NTP, WireGuard sind nicht prüfbar.\nKeine Port-Scans über große Bereiche (rechtlich heikel und blockiert).",
    },
    en: {
      purpose:
        "The Port Checker tests whether a TCP port on a remote host is reachable from the public Internet. Use it to validate firewall rules, cloud security groups, local services behind NAT, and provider routing — no SSH or nmap on your machine required.",
      how_it_works:
        "The server opens a TCP connection to the target and reports open / closed / timeout.\nLatency is measured in milliseconds so slow network hops are visible.\nCommon ports (21, 22, 80, 443, 3306, …) are annotated with the service hint.",
      when_to_use:
        "Verify firewall rules after provisioning a new server.\nReproduce a client's 'cannot connect' report without access to their network.\nCheck from the outside whether a service is publicly exposed (pre-pentest).",
      limits:
        "TCP only — UDP services like DNS, NTP, WireGuard cannot be probed.\nNo broad port-range scans (legally risky and likely blocked).",
    },
    hi: {
      purpose:
        "पोर्ट चेकर जाँचता है कि क्या किसी होस्ट पर TCP पोर्ट सार्वजनिक इंटरनेट से पहुँच योग्य है। फ़ायरवॉल नियमों, क्लाउड सुरक्षा समूहों, NAT के पीछे की स्थानीय सेवाओं और प्रदाता रूटिंग को सत्यापित करने के लिए उपयोग करें — आपकी मशीन पर SSH या nmap की आवश्यकता नहीं।",
      how_it_works:
        "सर्वर लक्ष्य से TCP कनेक्शन खोलता है और open / closed / timeout रिपोर्ट करता है।\nलेटेंसी मिलीसेकंड में मापी जाती है।\nसामान्य पोर्ट (22, 80, 443, …) सेवा संकेत के साथ चिह्नित होते हैं।",
      when_to_use:
        "नया सर्वर प्रोविजन करने के बाद फ़ायरवॉल नियम सत्यापित करें।\nग्राहक की “कनेक्ट नहीं हो रहा” रिपोर्ट पुन: उत्पन्न करें।\nबाहर से जाँचें कि कोई सेवा सार्वजनिक रूप से उजागर है या नहीं।",
      limits:
        "केवल TCP — UDP सेवाओं (DNS, NTP, WireGuard) की जाँच नहीं की जा सकती।\nबड़े पोर्ट-रेंज स्कैन नहीं (कानूनी रूप से जोखिम भरा)।",
    },
    zh: {
      purpose:
        "端口检测器测试目标主机的 TCP 端口是否可从公网访问。用于验证防火墙规则、云安全组、NAT 后的本地服务和提供商路由 — 无需在您的机器上使用 SSH 或 nmap。",
      how_it_works:
        "服务器向目标打开 TCP 连接，报告 open / closed / timeout。\n延迟以毫秒计量，便于发现慢速网络跳。\n常见端口 (22、80、443、…) 会带有服务提示。",
      when_to_use:
        "新服务器上线后验证防火墙规则。\n复现客户的“无法连接”问题，无需访问其网络。\n从外部检查服务是否公开暴露（渗透测试预检）。",
      limits:
        "仅 TCP — 无法探测 UDP 服务（DNS、NTP、WireGuard）。\n不支持大范围端口扫描（法律风险且通常被拦截）。",
    },
  },

  "ip-lookup": {
    de: {
      purpose:
        "Die IP-Abfrage bündelt Geolokation, Netzwerk- und Bedrohungs-Informationen für jede öffentliche IPv4 oder IPv6-Adresse. Sie zeigt Land, Stadt, Zeitzone, ISP, ASN und ob die IP zu einem VPN, Proxy, TOR-Exit oder Hosting-Provider gehört.",
      how_it_works:
        "Mehrere Geolocation-APIs werden parallel abgefragt; Abweichungen sind sichtbar.\nAS-Nummer und Hosting-Erkennung kommen aus den BGP-Routing-Daten.\nTOR-Exits werden gegen die offizielle Exit-Liste verglichen, VPN/Proxy heuristisch.",
      when_to_use:
        "Verdächtige Logins oder Anmeldeversuche kontextualisieren.\nKunden-Standort grob verifizieren (für Geo-Pricing oder Compliance).\nMissbräuchlichen Traffic auf Proxy-Pools oder Hosting-IPs zurückführen.",
      limits:
        "Stadt-Genauigkeit ist ungenau — oft nur ISP-PoP, nicht Endkunde.\nMobilfunk und CGNAT verschleiern den realen Standort.",
    },
    en: {
      purpose:
        "IP Lookup aggregates geolocation, network and threat information for any public IPv4 or IPv6 address. It tells you the country, city, timezone, ISP, ASN, and whether the IP belongs to a VPN, proxy, TOR exit or hosting provider.",
      how_it_works:
        "Several geolocation APIs are queried in parallel; divergences are surfaced.\nAS number and hosting detection come from BGP routing data.\nTOR exits are matched against the official exit list; VPN/proxy is heuristic.",
      when_to_use:
        "Contextualise suspicious logins or sign-up attempts.\nRoughly verify a customer's location for geo-pricing or compliance.\nTrace abusive traffic back to proxy pools or hosting IPs.",
      limits:
        "City-level accuracy is imprecise — often just the ISP PoP, not the end user.\nMobile networks and CGNAT mask real locations.",
    },
    hi: {
      purpose:
        "IP लुकअप किसी भी सार्वजनिक IPv4 या IPv6 पते के लिए जियोलोकेशन, नेटवर्क और थ्रेट जानकारी को एकत्र करता है। यह देश, शहर, समय क्षेत्र, ISP, ASN और यह बताता है कि IP VPN, प्रॉक्सी, TOR एग्जिट या होस्टिंग प्रदाता का है या नहीं।",
      how_it_works:
        "कई जियोलोकेशन API समानांतर में पूछे जाते हैं; अंतर दिखाए जाते हैं।\nAS नंबर और होस्टिंग पहचान BGP रूटिंग डेटा से आती है।\nTOR एग्जिट आधिकारिक सूची से मिलाए जाते हैं; VPN/प्रॉक्सी ह्यूरिस्टिक है।",
      when_to_use:
        "संदिग्ध लॉगिन या साइन-अप प्रयासों को संदर्भ दें।\nग्राहक का स्थान मोटे तौर पर सत्यापित करें।\nदुर्व्यवहार ट्रैफ़िक को प्रॉक्सी पूल या होस्टिंग IP पर वापस ट्रेस करें।",
      limits:
        "शहर-स्तर की सटीकता अस्पष्ट होती है।\nमोबाइल नेटवर्क और CGNAT वास्तविक स्थान छिपाते हैं।",
    },
    zh: {
      purpose:
        "IP 查询聚合任意公网 IPv4 或 IPv6 地址的地理位置、网络与威胁信息。显示国家、城市、时区、ISP、ASN，以及该 IP 是否属于 VPN、代理、TOR 出口或托管提供商。",
      how_it_works:
        "并行查询多个地理定位 API，差异会被展示。\nAS 号和托管识别来自 BGP 路由数据。\nTOR 出口与官方列表比对；VPN/代理为启发式判断。",
      when_to_use:
        "为可疑登录或注册尝试提供上下文。\n粗略验证客户位置（用于地理定价或合规）。\n将滥用流量追溯到代理池或托管 IP。",
      limits:
        "城市级别准确度有限 — 通常只是 ISP 接入点。\n移动网络和 CGNAT 会掩盖真实位置。",
    },
  },

  "dns-lookup": {
    de: {
      purpose:
        "Die DNS-Abfrage liefert alle gängigen Resource-Records (A, AAAA, MX, TXT, CNAME, NS, SOA, CAA) für eine Domain in einem Aufruf. Du siehst auf einen Blick was Authoritative-Server liefern — ohne `dig` lokal installieren zu müssen.",
      how_it_works:
        "Anfragen gehen über DNS-over-HTTPS (Cloudflare 1.1.1.1) — schnell und manipulationssicher.\nMehrere Record-Typen werden parallel geladen.\nTTL- und Authority-Daten werden mit angezeigt.",
      when_to_use:
        "Nach DNS-Änderungen prüfen ob die neue Konfiguration aktiv ist.\nMail-Setup verifizieren (MX, SPF im TXT, DKIM-Selektoren).\nCAA-Einträge prüfen bevor du Zertifikate ausstellst.",
      limits:
        "Liefert Daten von einem Resolver — für Verbreitung weltweit nutze DNS-Propagation.\nGeo-DNS / Anycast-Antworten können je nach Standort variieren.",
    },
    en: {
      purpose:
        "DNS Lookup fetches every common resource record (A, AAAA, MX, TXT, CNAME, NS, SOA, CAA) for a domain in a single call. See what authoritative servers actually return without installing `dig` locally.",
      how_it_works:
        "Queries run over DNS-over-HTTPS (Cloudflare 1.1.1.1) — fast and tamper-resistant.\nMultiple record types are loaded in parallel.\nTTL and authority info is shown alongside.",
      when_to_use:
        "Verify a DNS change is live after you edited a zone.\nValidate mail setup (MX, SPF in TXT, DKIM selectors).\nCheck CAA records before issuing certificates.",
      limits:
        "Returns data from one resolver — for global propagation use DNS Propagation.\nGeo-DNS / anycast responses may vary by location.",
    },
    hi: {
      purpose:
        "DNS लुकअप एक ही कॉल में किसी डोमेन के लिए सभी सामान्य रिकॉर्ड (A, AAAA, MX, TXT, CNAME, NS, SOA, CAA) लाता है। `dig` स्थापित किए बिना देखें कि अधिकृत सर्वर वास्तव में क्या लौटाते हैं।",
      how_it_works:
        "क्वेरी DNS-over-HTTPS (Cloudflare 1.1.1.1) पर चलती हैं।\nकई रिकॉर्ड प्रकार समानांतर में लोड होते हैं।\nTTL और authority जानकारी दिखाई जाती है।",
      when_to_use:
        "ज़ोन संपादित करने के बाद DNS परिवर्तन सक्रिय है या नहीं देखें।\nमेल सेटअप सत्यापित करें (MX, TXT में SPF, DKIM)।\nप्रमाणपत्र जारी करने से पहले CAA रिकॉर्ड जाँचें।",
      limits:
        "एक रिज़ॉल्वर से डेटा — वैश्विक प्रसार के लिए DNS Propagation का उपयोग करें।\nGeo-DNS / Anycast प्रतिक्रियाएँ स्थान के अनुसार भिन्न हो सकती हैं।",
    },
    zh: {
      purpose:
        "DNS 查询在一次调用中获取域名的所有常见记录 (A、AAAA、MX、TXT、CNAME、NS、SOA、CAA)。无需本地安装 `dig` 即可查看权威服务器返回的真实内容。",
      how_it_works:
        "通过 DNS-over-HTTPS (Cloudflare 1.1.1.1) 发起查询，快速且抗篡改。\n并行加载多种记录类型。\n同时显示 TTL 和权威信息。",
      when_to_use:
        "修改 DNS 区后确认变更是否生效。\n验证邮件配置 (MX、TXT 中的 SPF、DKIM)。\n在签发证书前检查 CAA 记录。",
      limits:
        "数据来自单个解析器 — 全球传播请用 DNS Propagation。\n地理 DNS / Anycast 响应可能因位置而异。",
    },
  },

  "ssl-check": {
    de: {
      purpose:
        "Die SSL-Zertifikat-Prüfung lädt das Zertifikat eines TLS-Hosts und zeigt Aussteller, Kette, Gültigkeitszeitraum, SAN-Liste, Cipher-Suite und ausgehandelte TLS-Version. So findest du Misskonfigurationen, abgelaufene Zertifikate und fehlende Intermediates.",
      how_it_works:
        "TLS-Handshake an Port 443 (oder benutzerdefiniert) liefert das Server-Zertifikat.\nDie komplette Kette bis zur Root-CA wird verfolgt und validiert.\nFingerprints (SHA-1/SHA-256) und Public-Key-Typ werden ausgewiesen.",
      when_to_use:
        "Vor einem Deployment Wildcard- oder SAN-Abdeckung prüfen.\nProaktiv vor Ablaufdatum warnen (Monitoring kann das automatisieren).\nBrowser-Warnungen reproduzieren (Hostname-Mismatch, Self-Signed).",
      limits:
        "Funktioniert nur mit TCP-Hosts auf Standard-TLS-Ports.\nClient-Authentifizierung (mTLS) wird nicht durchgeführt.",
    },
    en: {
      purpose:
        "SSL Certificate Check fetches the certificate from a TLS host and shows the issuer, chain, validity, SAN list, cipher suite and negotiated TLS version. Use it to spot misconfigurations, expired certificates and missing intermediates.",
      how_it_works:
        "A TLS handshake on port 443 (or custom) returns the server certificate.\nThe full chain up to the root CA is walked and validated.\nFingerprints (SHA-1/SHA-256) and public-key type are reported.",
      when_to_use:
        "Verify wildcard or SAN coverage before a deploy.\nProactively warn before expiry (automate with monitoring).\nReproduce browser warnings (hostname mismatch, self-signed).",
      limits:
        "Only works against TCP hosts on standard TLS ports.\nClient authentication (mTLS) is not performed.",
    },
    hi: {
      purpose:
        "SSL प्रमाणपत्र जाँच TLS होस्ट से प्रमाणपत्र लाती है और जारीकर्ता, श्रृंखला, वैधता, SAN सूची, सिफर सूट और TLS संस्करण दिखाती है। मिसकॉन्फ़िगरेशन, समाप्त प्रमाणपत्र और लापता इंटरमीडिएट खोजें।",
      how_it_works:
        "पोर्ट 443 पर TLS हैंडशेक सर्वर प्रमाणपत्र लौटाता है।\nरूट CA तक की पूरी श्रृंखला सत्यापित की जाती है।\nफ़िंगरप्रिंट (SHA-1/SHA-256) और सार्वजनिक-कुंजी प्रकार रिपोर्ट किए जाते हैं।",
      when_to_use:
        "डिप्लॉय से पहले वाइल्डकार्ड या SAN कवरेज सत्यापित करें।\nसमाप्ति से पहले सक्रिय रूप से चेतावनी दें।\nब्राउज़र चेतावनियाँ पुन: उत्पन्न करें (होस्टनाम बेमेल, सेल्फ-साइन्ड)।",
      limits:
        "केवल मानक TLS पोर्ट पर TCP होस्ट के विरुद्ध काम करता है।\nक्लाइंट प्रमाणीकरण (mTLS) नहीं किया जाता।",
    },
    zh: {
      purpose:
        "SSL 证书检测从 TLS 主机获取证书，显示颁发者、证书链、有效期、SAN 列表、加密套件和协商的 TLS 版本。用于发现配置错误、过期证书和缺失的中间证书。",
      how_it_works:
        "在端口 443 (或自定义) 进行 TLS 握手以获取服务器证书。\n沿证书链向上验证至根 CA。\n报告指纹 (SHA-1/SHA-256) 和公钥类型。",
      when_to_use:
        "部署前验证通配符或 SAN 覆盖范围。\n在到期前主动告警 (可用监控自动化)。\n复现浏览器警告 (主机名不匹配、自签名)。",
      limits:
        "仅适用于标准 TLS 端口的 TCP 主机。\n不执行客户端身份验证 (mTLS)。",
    },
  },

  whois: {
    de: {
      purpose:
        "WHOIS / RDAP zeigt die Registrierungsdaten einer Domain: Registrar, Status, Nameserver, Erstellungs- und Ablaufdatum. Die moderne RDAP-API liefert strukturierte JSON-Antworten statt dem alten Free-Text-WHOIS-Format.",
      how_it_works:
        "Anfrage geht an rdap.org bzw. den TLD-spezifischen RDAP-Server.\nFelder wie status, events, entities werden in lesbare Form umgewandelt.\nFalls RDAP für die TLD fehlt, fällt es auf klassisches WHOIS zurück.",
      when_to_use:
        "Domain-Eigentümer für Outreach oder Akquisitionsanfragen ermitteln.\nVor Ablauf einer Domain rechtzeitig informiert sein.\nMissbräuchliche Domain melden (abuse-Kontakt finden).",
      limits:
        "Privacy-Services verbergen Eigentümerdaten — du siehst dann nur den Proxy.\nWHOIS-Daten sind nicht garantiert aktuell oder genau (DSGVO).",
    },
    en: {
      purpose:
        "WHOIS / RDAP reveals a domain's registration data: registrar, status, nameservers, creation and expiry dates. The modern RDAP API returns structured JSON instead of the legacy free-text WHOIS format.",
      how_it_works:
        "The query is dispatched to rdap.org or the TLD-specific RDAP server.\nFields like status, events, entities are normalised into a readable form.\nFalls back to classic WHOIS when RDAP is unavailable for a TLD.",
      when_to_use:
        "Identify a domain owner for outreach or acquisition.\nGet ahead of an expiring domain you depend on.\nReport an abusive domain by finding the abuse contact.",
      limits:
        "Privacy services obscure ownership — you'll see only the proxy.\nWHOIS data is not guaranteed up-to-date or accurate (GDPR).",
    },
    hi: {
      purpose:
        "WHOIS / RDAP डोमेन का पंजीकरण डेटा प्रकट करता है: रजिस्ट्रार, स्थिति, नेमसर्वर, निर्माण और समाप्ति तिथियाँ। आधुनिक RDAP API पुराने टेक्स्ट WHOIS के बजाय संरचित JSON लौटाता है।",
      how_it_works:
        "क्वेरी rdap.org या TLD-विशिष्ट RDAP सर्वर को भेजी जाती है।\nstatus, events, entities जैसे फ़ील्ड पठनीय रूप में सामान्यीकृत किए जाते हैं।\nजब TLD के लिए RDAP उपलब्ध नहीं तो क्लासिक WHOIS पर वापस जाता है।",
      when_to_use:
        "आउटरीच या अधिग्रहण के लिए डोमेन स्वामी की पहचान करें।\nउस डोमेन की समाप्ति से पहले सूचित रहें जिस पर आप निर्भर हैं।\nदुरुपयोग संपर्क खोजकर अपमानजनक डोमेन रिपोर्ट करें।",
      limits:
        "गोपनीयता सेवाएँ स्वामित्व छिपाती हैं — आप केवल प्रॉक्सी देखेंगे।\nWHOIS डेटा अद्यतन या सटीक होने की गारंटी नहीं (GDPR)।",
    },
    zh: {
      purpose:
        "WHOIS / RDAP 显示域名的注册信息：注册商、状态、名称服务器、创建与到期日期。现代 RDAP API 返回结构化 JSON，取代了旧式自由文本 WHOIS。",
      how_it_works:
        "查询发送至 rdap.org 或对应 TLD 的 RDAP 服务器。\nstatus、events、entities 等字段被规范化为可读形式。\n若 TLD 不支持 RDAP，则回退至经典 WHOIS。",
      when_to_use:
        "识别域名所有者以便联系或收购。\n在依赖的域名到期前提前知晓。\n通过查找滥用联系人来举报恶意域名。",
      limits:
        "隐私服务会隐藏所有权 — 您只能看到代理。\nWHOIS 数据不保证最新或准确 (GDPR)。",
    },
  },

  subdomains: {
    de: {
      purpose:
        "Der Subdomain-Finder zählt Subdomains aus öffentlichen Certificate-Transparency-Logs (CT) auf. Da jedes ausgestellte SSL-Zertifikat in CT-Logs landet, verraten diese Logs die meisten je verwendeten Subdomains — ganz ohne aktives Scannen.",
      how_it_works:
        "crt.sh wird als primäre CT-Log-Quelle abgefragt.\nFällt crt.sh aus, dient CertSpotter (SSLMate) als zuverlässiger Backup.\nErgebnisse werden dedupliziert und nach Verschachtelungstiefe gruppiert.",
      when_to_use:
        "Asset-Discovery vor einem Pentest oder Bug-Bounty.\nVergessene Test-/Staging-Subdomains identifizieren bevor Angreifer es tun.\nM&A-Due-Diligence: Welche Subdomains betreibt das Zielunternehmen?",
      limits:
        "Findet nur Subdomains die jemals ein öffentliches SSL-Zertifikat hatten.\nReine Wildcard-Zertifikate (*.example.com) verraten keine konkreten Hosts.",
    },
    en: {
      purpose:
        "Subdomain Finder enumerates a domain's subdomains from public Certificate Transparency (CT) logs. Because every SSL certificate ever issued is logged in CT, those logs reveal almost every subdomain that ever existed — entirely passively, no scanning.",
      how_it_works:
        "crt.sh is queried as the primary CT-log source.\nIf crt.sh is down, CertSpotter (SSLMate) serves as a reliable backup.\nResults are deduplicated and grouped by depth below the apex.",
      when_to_use:
        "Asset discovery before a pentest or bug bounty.\nIdentify forgotten staging/dev subdomains before an attacker does.\nM&A due diligence: what subdomains does the target run?",
      limits:
        "Only finds subdomains that ever had a public SSL certificate.\nPure wildcard certificates (*.example.com) don't reveal concrete hosts.",
    },
    hi: {
      purpose:
        "सबडोमेन फाइंडर सार्वजनिक Certificate Transparency (CT) लॉग से डोमेन के सबडोमेन गिनता है। चूंकि प्रत्येक जारी किया गया SSL प्रमाणपत्र CT में लॉग होता है, ये लॉग लगभग हर सबडोमेन प्रकट करते हैं — बिना स्कैनिंग के।",
      how_it_works:
        "प्राथमिक CT-लॉग स्रोत के रूप में crt.sh पूछा जाता है।\nजब crt.sh विफल हो, CertSpotter (SSLMate) बैकअप के रूप में काम करता है।\nपरिणाम डुप्लिकेट हटाए जाते हैं और गहराई के अनुसार समूहीकृत होते हैं।",
      when_to_use:
        "पेंटेस्ट या बग बाउंटी से पहले एसेट डिस्कवरी।\nभूले हुए स्टेजिंग/डेव सबडोमेन की पहचान करें।\nM&A ड्यू डिलिजेंस: लक्ष्य कौन से सबडोमेन चलाता है?",
      limits:
        "केवल वे सबडोमेन मिलते हैं जिनके पास सार्वजनिक SSL प्रमाणपत्र था।\nशुद्ध वाइल्डकार्ड प्रमाणपत्र विशिष्ट होस्ट प्रकट नहीं करते।",
    },
    zh: {
      purpose:
        "子域名查找器从公开的 Certificate Transparency (CT) 日志枚举域名的子域名。由于每个签发的 SSL 证书都会进入 CT 日志，这些日志几乎能揭示所有曾经存在的子域名 — 完全被动，无需扫描。",
      how_it_works:
        "首先查询 crt.sh 作为主要 CT 日志源。\n当 crt.sh 不可用时，CertSpotter (SSLMate) 作为备用。\n结果去重并按相对父域的深度分组。",
      when_to_use:
        "渗透测试或漏洞赏金前的资产发现。\n在攻击者之前识别被遗忘的预发/测试子域名。\nM&A 尽调：目标公司运行哪些子域名？",
      limits:
        "只能找到曾经持有公开 SSL 证书的子域名。\n纯通配符证书 (*.example.com) 不会暴露具体主机。",
    },
  },

  "http-headers": {
    de: {
      purpose:
        "Der HTTP-Header-Inspektor lädt eine URL und bewertet die Sicherheits-Header (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) von A+ bis F. So siehst du in Sekunden ob deine Seite gegen XSS, Clickjacking und Mixed-Content-Angriffe gehärtet ist.",
      how_it_works:
        "Server sendet eine HEAD-Anfrage und parst die Response-Header.\nJeder Header wird gegen aktuelle Best Practices (OWASP) bewertet.\nAuch nicht-Sicherheits-Header wie Server, X-Powered-By werden gezeigt.",
      when_to_use:
        "Vor dem Go-Live einer Site die Header-Konfiguration validieren.\nSecurity-Audit für eigene oder fremde Web-Apps.\nFehlende HSTS oder CSP-Lücken vor dem Pentest finden.",
      limits:
        "Bewertet nur Standard-Header — Custom-Sicherheits-Header werden nicht anerkannt.\nCSP-Reports, nonce-basierte Policies werden nicht aktiv getestet.",
    },
    en: {
      purpose:
        "HTTP Headers Inspector fetches a URL and grades its security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) from A+ to F. See in seconds whether the site is hardened against XSS, clickjacking, and mixed-content attacks.",
      how_it_works:
        "Server sends a HEAD request and parses the response headers.\nEach header is evaluated against current best practice (OWASP).\nNon-security headers like Server and X-Powered-By are also shown.",
      when_to_use:
        "Validate header configuration before going live.\nSecurity audit your own or a third-party web app.\nFind missing HSTS or CSP gaps ahead of a pentest.",
      limits:
        "Grades standard headers only — custom security headers aren't credited.\nCSP reports and nonce-based policies aren't actively tested.",
    },
    hi: {
      purpose:
        "HTTP हेडर इंस्पेक्टर एक URL लाता है और इसके सुरक्षा हेडर (HSTS, CSP, X-Frame-Options आदि) को A+ से F तक ग्रेड करता है। सेकंडों में देखें कि साइट XSS, क्लिकजैकिंग और मिक्स्ड-कंटेंट हमलों के विरुद्ध सुरक्षित है या नहीं।",
      how_it_works:
        "सर्वर HEAD अनुरोध भेजता है और प्रतिक्रिया हेडर पार्स करता है।\nप्रत्येक हेडर वर्तमान सर्वोत्तम अभ्यास (OWASP) के विरुद्ध मूल्यांकन किया जाता है।\nServer और X-Powered-By जैसे गैर-सुरक्षा हेडर भी दिखाए जाते हैं।",
      when_to_use:
        "लाइव होने से पहले हेडर कॉन्फ़िगरेशन सत्यापित करें।\nअपने या तीसरे पक्ष के वेब ऐप का सुरक्षा ऑडिट करें।\nपेंटेस्ट से पहले लापता HSTS या CSP अंतराल खोजें।",
      limits:
        "केवल मानक हेडर का मूल्यांकन — कस्टम सुरक्षा हेडर को क्रेडिट नहीं।\nCSP रिपोर्ट और nonce-आधारित नीतियाँ सक्रिय रूप से परीक्षण नहीं की जातीं।",
    },
    zh: {
      purpose:
        "HTTP 标头检测器获取 URL 并将其安全标头 (HSTS、CSP、X-Frame-Options、X-Content-Type-Options、Referrer-Policy、Permissions-Policy) 评级为 A+ 至 F。秒级判断站点是否抵御 XSS、点击劫持和混合内容攻击。",
      how_it_works:
        "服务器发送 HEAD 请求并解析响应标头。\n根据当前最佳实践 (OWASP) 评估每个标头。\n也显示 Server 和 X-Powered-By 等非安全标头。",
      when_to_use:
        "上线前验证标头配置。\n对自有或第三方 Web 应用进行安全审计。\n在渗透测试前找出缺失的 HSTS 或 CSP 漏洞。",
      limits:
        "只评估标准标头 — 自定义安全标头不计入。\n不主动测试 CSP 报告和基于 nonce 的策略。",
    },
  },

  "email-verify": {
    de: {
      purpose:
        "Der E-Mail-Prüfer testet ob eine E-Mail-Adresse gültig und zustellbar ist — Syntax, MX-Einträge, Wegwerf-Anbieter und optional ein SMTP-Handshake. Das verhindert ungültige Anmeldungen und Bounces in deinem Newsletter.",
      how_it_works:
        "Syntax wird gegen RFC 5322 geprüft.\nMX-Records der Domain werden aufgelöst — fehlen sie, ist die Adresse unzustellbar.\nWegwerf-Anbieter werden gegen eine kuratierte Liste gemappt; SMTP-Probe bestätigt Zustellbarkeit.",
      when_to_use:
        "Newsletter-Anmeldungen direkt am Formular validieren.\nAlte Mail-Listen vor dem Versand bereinigen.\nFake-Anmeldungen mit Wegwerf-Adressen verhindern.",
      limits:
        "SMTP-Probe wird zunehmend von Mail-Servern geblockt.\nCatch-all-Domains akzeptieren auch nicht-existente Adressen — keine Aussage möglich.",
    },
    en: {
      purpose:
        "Email Verifier tests whether an email address is valid and deliverable — syntax, MX records, disposable provider, and optional SMTP handshake. Prevents invalid sign-ups and newsletter bounces.",
      how_it_works:
        "Syntax is checked against RFC 5322.\nThe domain's MX records are resolved — missing means undeliverable.\nDisposable providers are matched against a curated list; SMTP probe confirms deliverability.",
      when_to_use:
        "Validate newsletter sign-ups inline at the form.\nClean old mailing lists before a campaign.\nBlock throwaway addresses on signup.",
      limits:
        "SMTP probes are increasingly blocked by mail servers.\nCatch-all domains accept any address — verdict is inconclusive there.",
    },
    hi: {
      purpose:
        "ईमेल वेरिफायर परीक्षण करता है कि कोई ईमेल पता मान्य और डिलिवरेबल है या नहीं — सिंटैक्स, MX रिकॉर्ड, डिस्पोज़ेबल प्रदाता और वैकल्पिक SMTP हैंडशेक। अमान्य साइन-अप और बाउंस को रोकता है।",
      how_it_works:
        "सिंटैक्स RFC 5322 के विरुद्ध जाँचा जाता है।\nडोमेन के MX रिकॉर्ड हल किए जाते हैं — गायब हों तो undeliverable।\nडिस्पोज़ेबल प्रदाता क्यूरेटेड सूची से मिलाए जाते हैं; SMTP जाँच डिलिवरी की पुष्टि करती है।",
      when_to_use:
        "फॉर्म पर सीधे न्यूज़लेटर साइन-अप मान्य करें।\nअभियान से पहले पुरानी मेलिंग सूचियाँ साफ़ करें।\nसाइन-अप पर डिस्पोज़ेबल पते अवरुद्ध करें।",
      limits:
        "SMTP जाँच को मेल सर्वर अधिकतर ब्लॉक करते हैं।\nCatch-all डोमेन कोई भी पता स्वीकार करते हैं — निर्णायक नहीं।",
    },
    zh: {
      purpose:
        "邮箱验证器测试邮箱地址是否有效和可送达 — 语法、MX 记录、一次性邮箱、可选 SMTP 握手。防止无效注册和邮件退信。",
      how_it_works:
        "根据 RFC 5322 检查语法。\n解析域名的 MX 记录 — 缺失即不可送达。\n一次性邮箱与精选列表匹配；SMTP 探测确认可送达性。",
      when_to_use:
        "在表单内联验证订阅注册。\n活动前清理旧邮件列表。\n在注册时阻止一次性邮箱。",
      limits:
        "SMTP 探测越来越多地被邮件服务器拦截。\n通配收件域接受任何地址 — 该情况无法定论。",
    },
  },
};

for (const locale of LOCALES) {
  const file = FILES[locale];
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!j.tools) j.tools = {};
  for (const [slug, perLocale] of Object.entries(E)) {
    const node = perLocale[locale];
    if (!node) continue;
    if (!j.tools[slug]) j.tools[slug] = {};
    j.tools[slug].explainer = node;
  }
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
  console.log(`${locale}.json: explainer inserted for ${Object.keys(E).length} tools`);
}
