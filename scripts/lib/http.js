const https = require("https");
const http = require("http");

function fetchText(url, headers) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith("http://") ? http : https;
        const req = lib.get(
            url,
            {
                headers: Object.assign(
                    { "User-Agent": "Mozilla/5.0 NikkeManagerCatalog/1.0", Accept: "*/*" },
                    headers || {},
                ),
            },
            (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const next = res.headers.location.startsWith("http")
                        ? res.headers.location
                        : new URL(res.headers.location, url).href;
                    res.resume();
                    fetchText(next, headers).then(resolve, reject);
                    return;
                }
                const chunks = [];
                res.on("data", (chunk) => chunks.push(chunk));
                res.on("end", () => {
                    resolve({
                        status: res.statusCode,
                        body: Buffer.concat(chunks).toString("utf8"),
                        headers: res.headers,
                    });
                });
            },
        );
        req.setTimeout(30000, () => req.destroy(new Error(`Timeout for ${url}`)));
        req.on("error", reject);
    });
}

async function fetchJson(url, options) {
    const headers = Object.assign({ Accept: "application/json" }, (options && options.headers) || {});
    let res;
    if (options && options.method === "POST") {
        res = await postText(url, options.body || "", headers);
    } else {
        res = await fetchText(url, headers);
    }
    if (res.status < 200 || res.status >= 300) {
        const err = new Error(`HTTP ${res.status} for ${url}`);
        err.status = res.status;
        err.body = res.body.slice(0, 200);
        throw err;
    }
    if (!res.body) {
        throw new Error(`Empty body for ${url}`);
    }
    try {
        return JSON.parse(res.body);
    } catch (e) {
        const err = new Error(`Invalid JSON from ${url}`);
        err.cause = e;
        throw err;
    }
}

function postText(url, body, headers) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const lib = target.protocol === "http:" ? http : https;
        const req = lib.request(
            {
                protocol: target.protocol,
                hostname: target.hostname,
                path: target.pathname + target.search,
                method: "POST",
                headers: Object.assign(
                    {
                        "User-Agent": "Mozilla/5.0 NikkeManagerCatalog/1.0",
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(body),
                    },
                    headers || {},
                ),
            },
            (res) => {
                const chunks = [];
                res.on("data", (chunk) => chunks.push(chunk));
                res.on("end", () => {
                    resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") });
                });
            },
        );
        req.setTimeout(30000, () => req.destroy(new Error(`Timeout for ${url}`)));
        req.on("error", reject);
        req.write(body);
        req.end();
    });
}

module.exports = { fetchText, fetchJson };
