/* TradingView embed widgets. Official script URLs only.
   Ladder never reads prices out of the widget and never writes them into trades. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const ST = root.StockTracker = root.StockTracker || {};
  Object.assign(ST, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ADVANCED_CHART_URL = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  const TICKER_TAPE_URL = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
  const CHART_PERIODS = [
    { id: "1D", label: "1D", range: "1D", interval: "5" },
    { id: "5D", label: "5D", range: "5D", interval: "60" },
    { id: "1M", label: "1M", range: "1M", interval: "D" },
    { id: "6M", label: "6M", range: "6M", interval: "D" },
    { id: "YTD", label: "YTD", range: "YTD", interval: "D" },
    { id: "1Y", label: "1Y", range: "12M", interval: "D" },
    { id: "5Y", label: "5Y", range: "60M", interval: "W" },
    { id: "MAX", label: "MAX", range: "ALL", interval: "M" }
  ];
  const EXCHANGE_HINTS = {
    AAPL: "NASDAQ",
    NVDA: "NASDAQ",
    SOFI: "NASDAQ",
    TSLA: "NASDAQ",
    MSFT: "NASDAQ",
    AMD: "NASDAQ",
    QQQ: "NASDAQ",
    SPY: "AMEX"
  };
  let loadTimeoutMs = 8000;

  function periodById(id) {
    for (let i = 0; i < CHART_PERIODS.length; i++) {
      if (CHART_PERIODS[i].id === id) return CHART_PERIODS[i];
    }
    return CHART_PERIODS[3];
  }

  function tvSymbol(symbol, exchange) {
    const ticker = String(symbol || "").trim().replace(/^\$/, "").toUpperCase();
    const venue = String(exchange || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (!ticker) return "";
    return venue ? venue + ":" + ticker : ticker;
  }

  function chartWidgetConfig(symbol, exchange, periodId, theme) {
    const period = periodById(periodId);
    const dark = theme !== "light";
    return {
      autosize: true,
      symbol: tvSymbol(symbol, exchange) || "NASDAQ:AAPL",
      interval: period.interval,
      range: period.range,
      timezone: "exchange",
      theme: dark ? "dark" : "light",
      style: "1",
      locale: "en",
      backgroundColor: dark ? "#0c121b" : "#ffffff",
      gridColor: dark ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.08)",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: false,
      calendar: false,
      hide_volume: false,
      support_host: "https://www.tradingview.com",
      withdateranges: false
    };
  }

  function tapeWidgetConfig(items, theme) {
    const symbols = (items || []).map(function (item) {
      const symbol = tvSymbol(item.symbol, item.exchange);
      return symbol ? { proName: symbol, title: item.symbol } : null;
    }).filter(Boolean).slice(0, 30);
    return {
      symbols: symbols,
      showSymbolLogo: true,
      colorTheme: theme === "light" ? "light" : "dark",
      isTransparent: true,
      displayMode: "adaptive",
      locale: "en"
    };
  }

  function fallbackHtml(title, detail) {
    return '<div class="chart-fallback" role="status"><p><strong>' + title + '</strong></p><p>' + detail + '</p></div>';
  }

  function widgetFrameHtml(scriptUrl, configText) {
    const safeJson = configText.replace(/</g, "\\u003c");
    return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><style>html,body{margin:0;height:100%;background:transparent;color:#8fa0b6;font:14px system-ui,sans-serif}</style></head><body>" +
      "<div class=\"tradingview-widget-container\" style=\"height:100%\"><div class=\"tradingview-widget-container__widget\" style=\"height:calc(100% - 24px)\"></div>" +
      "<div class=\"tradingview-widget-copyright\"><a href=\"https://www.tradingview.com/\" target=\"_blank\" rel=\"noopener noreferrer\">TradingView</a></div></div>" +
      "<script>(function(){function makeStore(){var memory={};var store={getItem:function(k){return Object.prototype.hasOwnProperty.call(memory,k)?memory[k]:null;},setItem:function(k,v){memory[String(k)]=String(v);},removeItem:function(k){delete memory[k];},clear:function(){memory={};},key:function(i){return Object.keys(memory)[i]||null;}};try{Object.defineProperty(store,\"length\",{get:function(){return Object.keys(memory).length;}});}catch(e){}return store;}try{Object.defineProperty(window,\"localStorage\",{value:makeStore(),configurable:true});}catch(e){}try{Object.defineProperty(window,\"sessionStorage\",{value:makeStore(),configurable:true});}catch(e){}try{Object.defineProperty(document,\"cookie\",{get:function(){return \"\";},set:function(){},configurable:true});}catch(e){}var script=document.createElement(\"script\");script.async=true;script.src=" + JSON.stringify(scriptUrl) + ";script.text=" + JSON.stringify(safeJson) + ";" +
      "function report(ok){try{parent.postMessage({source:\"ladder-chart\",ok:!!ok},\"*\");}catch(e){}}" +
      "script.onerror=function(){report(false);};" +
      "script.onload=function(){var tries=0;var timer=setInterval(function(){if(document.querySelector(\"iframe\")){clearInterval(timer);report(true);}else if(++tries>40){clearInterval(timer);report(false);}},200);};" +
      "document.body.appendChild(script);})();<\/script></body></html>";
  }

  function mountEmbed(container, scriptUrl, config, options) {
    if (!container || typeof document === "undefined") return;
    const opts = options || {};
    const timeout = opts.timeout || loadTimeoutMs;
    const configText = JSON.stringify(config);
    if (container.getAttribute("data-widget-config") === configText && (container.getAttribute("data-widget-state") === "loading" || container.getAttribute("data-widget-state") === "loaded")) {
      return;
    }
    if (opts.generation) container.setAttribute("data-generation", String(opts.generation));
    const generation = container.getAttribute("data-generation");
    container.innerHTML = "";
    container.setAttribute("data-widget-config", configText);
    container.setAttribute("data-widget-src", scriptUrl);
    container.setAttribute("data-widget-state", "loading");
    const status = document.createElement("p");
    status.className = "chart-loading";
    status.textContent = opts.loadingText || "Loading…";
    const frame = document.createElement("iframe");
    frame.className = "widget-frame";
    frame.setAttribute("title", "TradingView");
    frame.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox");
    frame.setAttribute("referrerpolicy", "origin-when-cross-origin");
    frame.srcdoc = widgetFrameHtml(scriptUrl, configText);
    container.appendChild(status);
    container.appendChild(frame);
    let settled = false;
    function stillCurrent() {
      return container.getAttribute("data-generation") === generation;
    }
    function finish(ok) {
      if (settled || !stillCurrent()) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
      if (!ok) {
        container.innerHTML = opts.fallbackHtml || fallbackHtml("Unavailable", "The widget did not load. No price was stored.");
        container.setAttribute("data-widget-config", configText);
        container.setAttribute("data-widget-src", scriptUrl);
        container.setAttribute("data-widget-state", "fallback");
        return;
      }
      if (status.parentNode) status.parentNode.removeChild(status);
      container.setAttribute("data-widget-state", "loaded");
    }
    function onMessage(event) {
      if (!frame.contentWindow || event.source !== frame.contentWindow) return;
      if (!event.data || event.data.source !== "ladder-chart") return;
      finish(!!event.data.ok);
    }
    window.addEventListener("message", onMessage);
    const started = Date.now();
    const timer = setInterval(function () {
      if (!stillCurrent()) { clearInterval(timer); window.removeEventListener("message", onMessage); return; }
      if (Date.now() - started >= timeout) finish(false);
    }, 200);
  }

  function mountChart(container, config) {
    const symbol = config && config.symbol ? config.symbol : "the symbol";
    mountEmbed(container, ADVANCED_CHART_URL, config, {
      generation: (container && container.getAttribute("data-generation") || "0") + "c",
      loadingText: "Loading chart…",
      fallbackHtml: fallbackHtml(
        "Chart unavailable",
        "TradingView did not load for " + symbol + ". No price was filled in, and your trades were not changed."
      )
    });
  }

  function mountTape(container, config) {
    if (!config || !config.symbols || !config.symbols.length) {
      if (container) {
        container.innerHTML = fallbackHtml("No watchlist prices", "Add a symbol to the watchlist. Bryz Trades does not invent a quote.");
        container.setAttribute("data-widget-state", "empty");
        container.setAttribute("data-widget-config", JSON.stringify(config || { symbols: [] }));
      }
      return;
    }
    mountEmbed(container, TICKER_TAPE_URL, config, {
      generation: (container && container.getAttribute("data-generation") || "0") + "t",
      loadingText: "Loading watchlist prices…",
      fallbackHtml: fallbackHtml(
        "Prices unavailable",
        "TradingView did not load. No quote was stored in your journal."
      )
    });
  }

  return {
    ADVANCED_CHART_URL: ADVANCED_CHART_URL,
    TICKER_TAPE_URL: TICKER_TAPE_URL,
    CHART_PERIODS: CHART_PERIODS,
    EXCHANGE_HINTS: EXCHANGE_HINTS,
    periodById: periodById,
    tvSymbol: tvSymbol,
    chartWidgetConfig: chartWidgetConfig,
    tapeWidgetConfig: tapeWidgetConfig,
    mountChart: mountChart,
    mountTape: mountTape,
    setChartTimeout: function (ms) { loadTimeoutMs = ms; }
  };
});
