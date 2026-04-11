const SOCKET_URL = "wss://api.scaledrone.com/v3/websocket";

export class ScaledroneObservableRoom extends EventTarget {
  constructor({
    channelId,
    roomName = "observable-main",
    clientData = {},
    historyCount = 50,
    reconnectBaseDelayMs = 1200,
    reconnectMaxDelayMs = 12000,
  }) {
    super();

    this.channelId = channelId;
    this.roomName = roomName;
    this.clientData = clientData;
    this.historyCount = clampHistoryCount(historyCount);
    this.reconnectBaseDelayMs = reconnectBaseDelayMs;
    this.reconnectMaxDelayMs = reconnectMaxDelayMs;

    this.socket = null;
    this.clientId = null;
    this.state = "idle";
    this.hasEverConnected = false;
    this.manualClose = false;
    this.shouldReconnect = false;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;

    this.callbackCounter = 0;
    this.callbackResolvers = new Map();
    this.membersById = new Map();

    this.historyBuffer = [];
    this.historyFlushTimer = null;
    this.historyFlushComplete = false;
  }

  async connect() {
    if (!this.channelId?.trim()) {
      throw new Error("A Scaledrone channel ID is required.");
    }

    if (this.state === "connecting" || this.state === "connected" || this.state === "reconnecting") {
      return;
    }

    this.manualClose = false;
    this.shouldReconnect = true;
    this.reconnectAttempt = 0;
    this.hasEverConnected = false;

    return this._openSocket(false);
  }

  close() {
    this.manualClose = true;
    this.shouldReconnect = false;
    this._clearReconnectTimer();
    this._clearHistoryWindow();

    if (this.socket) {
      const activeSocket = this.socket;
      this.socket = null;
      activeSocket.close(1000, "client_close");
    } else {
      this._setState("closed");
      this._emit("close", { reason: "client_close" });
    }
  }

  async publish(message) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.state !== "connected") {
      throw new Error("The room is not connected.");
    }

    this._send({
      type: "publish",
      room: this.roomName,
      message,
    });
  }

  _openSocket(isReconnect) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(SOCKET_URL);
      let setupComplete = false;
      let settled = false;

      this.socket = socket;
      this.membersById.clear();
      this._setState(isReconnect ? "reconnecting" : "connecting");

      const settleResolve = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      const settleReject = (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      socket.addEventListener("open", async () => {
        try {
          const handshake = await this._sendWithCallback(
            {
              type: "handshake",
              channel: this.channelId.trim(),
              client_data: this.clientData,
            },
            socket,
          );

          this.clientId = handshake.client_id ?? null;

          const subscribePayload = {
            type: "subscribe",
            room: this.roomName,
          };

          if (this.historyCount > 0) {
            subscribePayload.history_count = this.historyCount;
          }

          const subscribe = await this._sendWithCallback(subscribePayload, socket);

          this.roomName = subscribe.room ?? this.roomName;
          this._startHistoryWindow();

          setupComplete = true;
          this.hasEverConnected = true;
          this.reconnectAttempt = 0;
          this._setState("connected");
          this._emit(isReconnect ? "reconnect" : "open", {
            clientId: this.clientId,
            room: this.roomName,
          });
          settleResolve();
        } catch (error) {
          const fatalError = toError(error, "Scaledrone connection failed.");
          fatalError.fatal = true;
          this.shouldReconnect = false;
          this._emit("error", { message: fatalError.message, fatal: true });
          settleReject(fatalError);
          socket.close(4000, "setup_failed");
        }
      });

      socket.addEventListener("message", (event) => {
        this._handleSocketMessage(event.data, socket);
      });

      socket.addEventListener("error", () => {
        this._emit("error", {
          message: "The Scaledrone socket reported an error.",
          fatal: false,
        });
      });

      socket.addEventListener("close", (event) => {
        if (this.socket === socket) {
          this.socket = null;
        }

        this._rejectPendingCallbacks(new Error("The Scaledrone socket closed."));
        this._clearHistoryWindow();

        if (this.manualClose) {
          this._setState("closed");
          this._emit("close", {
            code: event.code,
            reason: event.reason || "client_close",
          });
          settleReject(new Error("Connection closed."));
          return;
        }

        if (!setupComplete) {
          if (isReconnect && this.shouldReconnect) {
            this._setState("reconnecting");
            this._scheduleReconnect();
          } else {
            this._setState("closed");
          }

          settleReject(new Error(event.reason || "Connection closed before the room was ready."));
          return;
        }

        this._setState("reconnecting");
        this._emit("disconnect", {
          code: event.code,
          reason: event.reason || "socket_closed",
        });

        if (this.shouldReconnect) {
          this._scheduleReconnect();
        } else {
          this._setState("closed");
          this._emit("close", {
            code: event.code,
            reason: event.reason || "socket_closed",
          });
        }
      });
    });
  }

  _scheduleReconnect() {
    if (this.reconnectTimer || this.manualClose || !this.shouldReconnect) {
      return;
    }

    const delay = Math.min(
      this.reconnectBaseDelayMs * (2 ** this.reconnectAttempt),
      this.reconnectMaxDelayMs,
    );

    this.reconnectAttempt += 1;

    this.reconnectTimer = globalThis.setTimeout(() => {
      this.reconnectTimer = null;

      this._openSocket(true).catch((error) => {
        if (!this.manualClose && this.shouldReconnect && !error?.fatal) {
          this._scheduleReconnect();
        }
      });
    }, delay);
  }

  _clearReconnectTimer() {
    if (this.reconnectTimer) {
      globalThis.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  _startHistoryWindow() {
    this._clearHistoryWindow();
    this.historyBuffer = [];
    this.historyFlushComplete = false;

    if (this.historyCount <= 0) {
      queueMicrotask(() => {
        this.historyFlushComplete = true;
        this._emit("history", { messages: [] });
      });
      return;
    }

    this.historyFlushTimer = globalThis.setTimeout(() => {
      this._flushHistoryBuffer();
    }, 350);
  }

  _clearHistoryWindow() {
    if (this.historyFlushTimer) {
      globalThis.clearTimeout(this.historyFlushTimer);
      this.historyFlushTimer = null;
    }
  }

  _queueHistoryMessage(payload) {
    if (this.historyFlushComplete) {
      this._emit("history", {
        messages: [this._materializeHistoryMessage(payload)],
      });
      return;
    }

    this.historyBuffer.push(payload);

    if (this.historyFlushTimer) {
      globalThis.clearTimeout(this.historyFlushTimer);
    }

    this.historyFlushTimer = globalThis.setTimeout(() => {
      this._flushHistoryBuffer();
    }, 140);
  }

  _flushHistoryBuffer() {
    if (this.historyFlushComplete) {
      return;
    }

    this._clearHistoryWindow();
    this.historyFlushComplete = true;

    const messages = [...this.historyBuffer]
      .sort((left, right) => right.index - left.index)
      .map((item) => this._materializeHistoryMessage(item));

    this.historyBuffer = [];
    this._emit("history", { messages });
  }

  _materializeHistoryMessage(payload) {
    return {
      ...payload,
      member: this.membersById.get(payload.clientId) || null,
    };
  }

  _send(payload) {
    const serialized = JSON.stringify(payload);
    this.socket?.send(serialized);
  }

  _sendWithCallback(payload, socket) {
    return new Promise((resolve, reject) => {
      const callbackId = ++this.callbackCounter;

      this.callbackResolvers.set(callbackId, { resolve, reject });

      try {
        socket.send(
          JSON.stringify({
            ...payload,
            callback: callbackId,
          }),
        );
      } catch (error) {
        this.callbackResolvers.delete(callbackId);
        reject(error);
      }
    });
  }

  _rejectPendingCallbacks(error) {
    for (const [callbackId, resolver] of this.callbackResolvers.entries()) {
      resolver.reject(error);
      this.callbackResolvers.delete(callbackId);
    }
  }

  _handleSocketMessage(serializedMessage, socket) {
    if (socket !== this.socket) {
      return;
    }

    let payload;

    try {
      payload = JSON.parse(serializedMessage);
    } catch (_error) {
      this._emit("error", {
        message: "Received malformed JSON from Scaledrone.",
        fatal: false,
      });
      return;
    }

    if (payload.callback) {
      const resolver = this.callbackResolvers.get(payload.callback);

      if (resolver) {
        this.callbackResolvers.delete(payload.callback);

        if (payload.error) {
          resolver.reject(new Error(payload.error));
        } else {
          resolver.resolve(payload);
        }
      }

      return;
    }

    switch (payload.type) {
      case "publish":
        if (payload.room !== this.roomName) {
          return;
        }

        this._emit("message", {
          message: {
            source: "live",
            room: payload.room,
            clientId: payload.client_id ?? null,
            data: payload.message,
            member: this.membersById.get(payload.client_id) || null,
            timestamp: null,
            id: null,
          },
        });
        break;

      case "history_message":
        if (payload.room !== this.roomName) {
          return;
        }

        this._queueHistoryMessage({
          source: "history",
          room: payload.room,
          clientId: payload.client_id ?? null,
          data: payload.message,
          timestamp: payload.timestamp ?? null,
          id: payload.id ?? null,
          index: payload.index ?? 0,
        });
        break;

      case "observable_members":
        this.membersById = new Map(
          (payload.data || []).map((member) => [member.id, member]),
        );
        this._emit("members", {
          members: Array.from(this.membersById.values()),
        });
        break;

      case "observable_member_join":
        if (payload.data?.id) {
          this.membersById.set(payload.data.id, payload.data);
        }

        this._emit("member_join", {
          member: payload.data || null,
        });
        break;

      case "observable_member_leave": {
        const existingMember = this.membersById.get(payload.data?.id) || payload.data || null;

        if (payload.data?.id) {
          this.membersById.delete(payload.data.id);
        }

        this._emit("member_leave", {
          member: existingMember,
        });
        break;
      }

      default:
        this._emit("unknown", { payload });
        break;
    }
  }

  _setState(nextState) {
    this.state = nextState;
    this._emit("statechange", { state: nextState });
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

function clampHistoryCount(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 50;
  }

  return Math.min(parsed, 100);
}

function toError(error, fallbackMessage) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage);
}
