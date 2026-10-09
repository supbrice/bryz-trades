/* Pasted-close checklist. Levels are plans compared with a close the user types. */
(function (root) {
  const ST = root.StockTracker = root.StockTracker || {};

  /**
   * Hard stop is checked before get-out. A close equal to a level is not under it.
   * Returns null when this trade is not using the checklist.
   * Short trades are not scored with the long-trade comparison.
   */
  ST.computeStatus = function (trade) {
    const order = trade && trade.orderStatus;
    if (order !== "waiting" && order !== "filled" && order !== "cancelled") return null;
    if (trade.direction === "short") {
      return {
        text: "Checklist is for long trades",
        kind: "wait",
        detail: "The pasted-close checklist uses long-trade rules. It is not applied to shorts."
      };
    }
    const detail = ST.CHECKLIST_HELP || "This uses the close you paste. It is not a live market check.";
    if (order === "waiting" || order === "cancelled") {
      return { text: "Waiting — checklist only", kind: "wait", detail: detail };
    }
    const close = typeof trade.close === "number" ? trade.close : null;
    const getOut = typeof trade.getOut === "number" ? trade.getOut : null;
    const hardStop = typeof trade.hardStop === "number" ? trade.hardStop : null;
    if (close == null) return { text: "Filled — hold (no close pasted)", kind: "hold", detail: detail };
    if (hardStop != null && close < hardStop) return { text: "Pasted close is under the hard stop", kind: "stop", detail: detail };
    if (getOut != null && close < getOut) return { text: "Pasted close is under get-out", kind: "exit", detail: detail };
    return { text: "Filled — hold", kind: "hold", detail: detail };
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
