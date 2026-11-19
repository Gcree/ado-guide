(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ADO_PENLIGHT = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function createPenlightClient(options = {}) {
    const opts = options && typeof options === "object" ? options : {};
    const url = typeof opts.url === "string" && opts.url ? opts.url : "ws://127.0.0.1:51730";
    const throttleMs = opts.throttleMs != null && Number.isFinite(Number(opts.throttleMs))
      ? Math.max(0, Number(opts.throttleMs))
      : 200;
    const backoffBaseMs = opts.backoffBaseMs != null && Number.isFinite(Number(opts.backoffBaseMs))
      ? Math.max(1, Number(opts.backoffBaseMs))
      : 1000;
    const backoffMaxMs = opts.backoffMaxMs != null && Number.isFinite(Number(opts.backoffMaxMs))
      ? Math.max(backoffBaseMs, Number(opts.backoffMaxMs))
      : 30000;
    const maxRetries = opts.maxRetries != null && Number.isFinite(Number(opts.maxRetries))
      ? Math.max(0, Number(opts.maxRetries))
      : Infinity;
    const onState = typeof opts.onState === "function" ? opts.onState : () => {};
    const onMessage = typeof opts.onMessage === "function" ? opts.onMessage : null;
    const nowFn = typeof opts.now === "function" ? opts.now : () => Date.now();
    const hasCtor = Object.prototype.hasOwnProperty.call(opts, "WebSocketCtor");
    const WS = hasCtor ? opts.WebSocketCtor : (typeof WebSocket !== "undefined" ? WebSocket : null);

    const WS_CONNECTING = WS && typeof WS.CONNECTING === "number" ? WS.CONNECTING : 0;
    const WS_OPEN = WS && typeof WS.OPEN === "number" ? WS.OPEN : 1;

    let ws = null;
    let enabled = Boolean(opts.enabled);
    let state = "disconnected";
    let retryCount = 0;
    let reconnectTimer = null;
    let lastSentAt = -Infinity;

    function emitState(nextState, detail) {
      state = nextState;
      try {
        onState(nextState, { state: nextState, enabled, retryCount, ...(detail || {}) });
      } catch (e) {}
    }

    function clearReconnect() {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function scheduleReconnect() {
      clearReconnect();
      if (!enabled || !WS) return;
      if (retryCount >= maxRetries) {
        emitState("unavailable", { reason: "max-retries" });
        return;
      }
      const delay = Math.min(backoffMaxMs, backoffBaseMs * Math.pow(2, retryCount));
      retryCount++;
      emitState("reconnecting", { delay });
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (enabled) openSocket();
      }, delay);
    }

    function isConnected() {
      return Boolean(ws && ws.readyState === WS_OPEN);
    }

    function isEnabled() {
      return enabled;
    }

    function openSocket() {
      clearReconnect();
      if (!WS || typeof WS !== "function") {
        emitState("unavailable");
        return false;
      }
      if (ws && (ws.readyState === WS_CONNECTING || ws.readyState === WS_OPEN)) {
        return true;
      }
      emitState("connecting");
      let sock;
      try {
        sock = new WS(url);
      } catch (err) {
        if (err && err.name === "SecurityError") {
          emitState("unavailable", { error: err });
          return false;
        }
        emitState("error", { error: err });
        if (enabled) scheduleReconnect();
        return false;
      }

      ws = sock;

      sock.onopen = () => {
        if (sock !== ws) return;
        retryCount = 0;
        lastSentAt = -Infinity;
        emitState("connected");
      };

      sock.onmessage = ev => {
        if (sock !== ws) return;
        let msg = null;
        try {
          msg = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        } catch (e) {}
        if (onMessage) {
          try {
            onMessage(msg, ev);
          } catch (e) {}
        }
        if (msg && msg.type === "hello") {
          emitState("connected", { lamp: msg.lamp ?? null, msg });
        }
      };

      sock.onerror = err => {
        if (sock !== ws) return;
        emitState("error", { error: err });
      };

      sock.onclose = ev => {
        if (sock !== ws) return;
        ws = null;
        if (enabled) {
          scheduleReconnect();
        } else {
          emitState("disconnected", { event: ev });
        }
      };

      return true;
    }

    function connect() {
      retryCount = 0;
      return openSocket();
    }

    function sendImmediate(payload) {
      if (!isConnected()) return false;
      try {
        const wire = typeof payload === "string" ? payload : JSON.stringify(payload);
        ws.send(wire);
        lastSentAt = nowFn();
        return true;
      } catch (e) {
        return false;
      }
    }

    function send(payload) {
      if (!isConnected()) return false;
      const now = nowFn();
      if (throttleMs > 0 && now - lastSentAt < throttleMs) return false;
      return sendImmediate(payload);
    }

    function disconnect(stopPayload) {
      clearReconnect();
      retryCount = 0;
      const sock = ws;
      if (sock) {
        if (stopPayload && sock.readyState === WS_OPEN) {
          try {
            const wire = typeof stopPayload === "string" ? stopPayload : JSON.stringify(stopPayload);
            sock.send(wire);
          } catch (e) {}
        }
        ws = null;
        try {
          sock.onopen = null;
          sock.onmessage = null;
          sock.onerror = null;
          sock.onclose = null;
          sock.close();
        } catch (e) {}
      }
      lastSentAt = -Infinity;
      emitState("disconnected");
    }

    function setEnabled(nextEnabled) {
      const flag = Boolean(nextEnabled);
      enabled = flag;
      if (flag) {
        connect();
      } else {
        disconnect();
      }
      return enabled;
    }

    return {
      connect,
      disconnect,
      send,
      sendImmediate,
      isConnected,
      isEnabled,
      setEnabled,
      get state() {
        return state;
      }
    };
  }

  return { createPenlightClient };
});
