"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

const GATEWAY_OPTIONS = ["Agentverse", "X402"] as const;

const CHAIN_OPTIONS = {
  Agentverse: ["Base", "Polygon", "Optimism"],
  X402: ["Base", "Arbitrum", "Ethereum"],
} as const;

const PAYMENT_METHODS = [
  { id: "usdc", label: "USDC Stablecoin" },
  { id: "native", label: "Native Token" },
] as const;

type Gateway = (typeof GATEWAY_OPTIONS)[number];
type PaymentMethod = (typeof PAYMENT_METHODS)[number]["id"];

interface SettingsState {
  gateway: Gateway;
  chain: string;
}

type VideoPhase = "idle" | "requesting" | "rendering" | "completed";

interface VideoState {
  prompt: string;
  phase: VideoPhase;
  paymentMethod: PaymentMethod;
  progress?: string;
  error?: string;
  videoUrl?: string;
}

interface StreamEvent {
  id: string;
  timestamp: string;
  description: string;
  amount: number;
  chain: string;
  gateway: Gateway;
}

interface Subscription {
  id: string;
  keyword: string;
  pricePerVideo: number;
  paymentMethod: PaymentMethod;
  status: "idle" | "streaming";
  gateway: Gateway;
  chain: string;
  totalCharged: number;
  events: StreamEvent[];
  lastError?: string;
  createdAt: string;
}

const VIDEO_COST: Record<PaymentMethod, number> = {
  usdc: 8,
  native: 0.25,
};

const INITIAL_BALANCES: Record<PaymentMethod, number> = {
  usdc: 42,
  native: 1.2,
};

const PLACEHOLDER_VIDEO =
  "https://storage.googleapis.com/coverr-main/mp4/Mt_Baker.mp4";

const toPrecision = (method: PaymentMethod, value: number) =>
  Number(value.toFixed(method === "usdc" ? 2 : 4));

const formatBalance = (method: PaymentMethod, value: number) =>
  method === "usdc"
    ? `${value.toFixed(2)} USDC`
    : `${value.toFixed(4)} Native`;

const methodLabel = (method: PaymentMethod) =>
  PAYMENT_METHODS.find((item) => item.id === method)?.label ?? method;

const formatTimestamp = (timestamp: string) =>
  new Date(timestamp).toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export default function Home() {
  const [settings, setSettings] = useState<SettingsState>({
    gateway: "Agentverse",
    chain: CHAIN_OPTIONS.Agentverse[0],
  });

  const [balances, setBalances] =
    useState<Record<PaymentMethod, number>>(INITIAL_BALANCES);

  const balancesRef = useRef(balances);
  useEffect(() => {
    balancesRef.current = balances;
  }, [balances]);

  const [activeView, setActiveView] =
    useState<"video" | "subscriptions">("video");

  const [videoState, setVideoState] = useState<VideoState>({
    prompt: "",
    phase: "idle",
    paymentMethod: PAYMENT_METHODS[0].id,
  });

  const pollingTimers = useRef<NodeJS.Timeout[]>([]);
  useEffect(
    () => () => {
      pollingTimers.current.forEach(clearTimeout);
      pollingTimers.current = [];
    },
    []
  );

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const streamTimers = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(
    () => () => {
      Object.values(streamTimers.current).forEach(clearTimeout);
    },
    []
  );

  const [subscriptionForm, setSubscriptionForm] = useState<{
    keyword: string;
    pricePerVideo: string;
    paymentMethod: PaymentMethod;
  }>({
    keyword: "",
    pricePerVideo: "2.50",
    paymentMethod: PAYMENT_METHODS[0].id,
  });

  const [subscriptionError, setSubscriptionError] = useState<string | null>(
    null
  );
  const [subscriptionNotice, setSubscriptionNotice] = useState<string | null>(
    null
  );

  const handleGatewayChange = (gateway: Gateway) => {
    setSettings((prev) => {
      const availableChains = CHAIN_OPTIONS[gateway];
      const nextChain = availableChains.includes(prev.chain)
        ? prev.chain
        : availableChains[0];
      return { gateway, chain: nextChain };
    });
  };

  const handleChainChange = (chain: string) => {
    setSettings((prev) => ({ ...prev, chain }));
  };

  const handleTopUp = (method: PaymentMethod) => {
    const increment = method === "usdc" ? 25 : 0.6;
    setBalances((prev) => ({
      ...prev,
      [method]: toPrecision(method, prev[method] + increment),
    }));
  };

  const resetVideoTimers = () => {
    pollingTimers.current.forEach(clearTimeout);
    pollingTimers.current = [];
  };

  const submitVideoRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedPrompt = videoState.prompt.trim();

    if (!trimmedPrompt) {
      setVideoState((prev) => ({
        ...prev,
        error: "Please enter a prompt to render a video.",
      }));
      return;
    }

    const cost = VIDEO_COST[videoState.paymentMethod];
    const available = balancesRef.current[videoState.paymentMethod];

    if (available < cost) {
      setVideoState((prev) => ({
        ...prev,
        error: `Insufficient ${methodLabel(
          videoState.paymentMethod
        )}. You need ${formatBalance(
          videoState.paymentMethod,
          cost
        )} for this render.`,
        phase: "idle",
      }));
      return;
    }

    setBalances((prev) => ({
      ...prev,
      [videoState.paymentMethod]: toPrecision(
        videoState.paymentMethod,
        prev[videoState.paymentMethod] - cost
      ),
    }));

    resetVideoTimers();

    setVideoState((prev) => ({
      ...prev,
      phase: "requesting",
      error: undefined,
      progress: `Submitting render request to ${settings.gateway} on ${settings.chain}...`,
      videoUrl: undefined,
    }));

    const startPolling = setTimeout(() => {
      setVideoState((prev) => ({
        ...prev,
        phase: "rendering",
        progress: `Render started • awaiting confirmations on ${settings.chain}`,
      }));
    }, 1200);

    const finishPolling = setTimeout(() => {
      setVideoState((prev) => ({
        ...prev,
        phase: "completed",
        progress: `Render completed and delivered via ${settings.gateway}.`,
        videoUrl: PLACEHOLDER_VIDEO,
      }));
    }, 4200);

    pollingTimers.current.push(startPolling, finishPolling);
  };

  const resetVideoFlow = () => {
    resetVideoTimers();
    setVideoState((prev) => ({
      ...prev,
      prompt: "",
      phase: "idle",
      progress: undefined,
      error: undefined,
      videoUrl: undefined,
    }));
  };

  const scheduleNextDelivery = (subscriptionId: string) => {
    if (streamTimers.current[subscriptionId]) {
      clearTimeout(streamTimers.current[subscriptionId]);
    }

    const delay = 3800 + Math.random() * 3200;
    streamTimers.current[subscriptionId] = setTimeout(() => {
      setSubscriptions((prevSubs) => {
        const target = prevSubs.find((item) => item.id === subscriptionId);
        if (!target || target.status !== "streaming") {
          return prevSubs;
        }

        const available =
          balancesRef.current[target.paymentMethod] ?? Number.NaN;

        if (Number.isNaN(available) || available < target.pricePerVideo) {
          setSubscriptionError(
            `Insufficient ${methodLabel(
              target.paymentMethod
            )} to continue "${target.keyword}". Stream paused.`
          );
          clearTimeout(streamTimers.current[subscriptionId]);
          delete streamTimers.current[subscriptionId];

          return prevSubs.map((item) =>
            item.id === subscriptionId
              ? {
                  ...item,
                  status: "idle",
                  lastError: "Stream paused: insufficient balance.",
                }
              : item
          );
        }

        setBalances((prevBalances) => ({
          ...prevBalances,
          [target.paymentMethod]: toPrecision(
            target.paymentMethod,
            prevBalances[target.paymentMethod] - target.pricePerVideo
          ),
        }));

        const streamEvent: StreamEvent = {
          id: typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${subscriptionId}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          description: `Delivered video for "${target.keyword}"`,
          amount: target.pricePerVideo,
          chain: target.chain,
          gateway: target.gateway,
        };

        const updatedSubs = prevSubs.map((item) =>
          item.id === subscriptionId
            ? {
                ...item,
                totalCharged: toPrecision(
                  item.paymentMethod,
                  item.totalCharged + target.pricePerVideo
                ),
                events: [streamEvent, ...item.events].slice(0, 8),
                lastError: undefined,
              }
            : item
        );

        scheduleNextDelivery(subscriptionId);
        return updatedSubs;
      });
    }, delay);
  };

  const startStream = (subscriptionId: string) => {
    let started: Subscription | null = null;

    setSubscriptions((prevSubs) => {
      const target = prevSubs.find((item) => item.id === subscriptionId);
      if (!target) {
        return prevSubs;
      }

      if (target.status === "streaming") {
        return prevSubs;
      }

      const available = balancesRef.current[target.paymentMethod];
      if (available < target.pricePerVideo) {
        setSubscriptionError(
          `Insufficient ${methodLabel(
            target.paymentMethod
          )} to start streaming "${target.keyword}".`
        );
        return prevSubs.map((item) =>
          item.id === subscriptionId
            ? {
                ...item,
                lastError: "Cannot start stream: insufficient balance.",
              }
            : item
        );
      }

      started = { ...target, status: "streaming" };
      return prevSubs.map((item) =>
        item.id === subscriptionId
          ? { ...item, status: "streaming", lastError: undefined }
          : item
      );
    });

    if (started) {
      setSubscriptionNotice(
        `Streaming started for "${started.keyword}" on ${started.chain} via ${started.gateway}.`
      );
      scheduleNextDelivery(started.id);
    }
  };

  const stopStream = (subscriptionId: string) => {
    if (streamTimers.current[subscriptionId]) {
      clearTimeout(streamTimers.current[subscriptionId]);
      delete streamTimers.current[subscriptionId];
    }

    setSubscriptions((prevSubs) =>
      prevSubs.map((item) =>
        item.id === subscriptionId
          ? { ...item, status: "idle", lastError: undefined }
          : item
      )
    );
  };

  const removeSubscription = (subscriptionId: string) => {
    if (streamTimers.current[subscriptionId]) {
      clearTimeout(streamTimers.current[subscriptionId]);
      delete streamTimers.current[subscriptionId];
    }

    setSubscriptions((prevSubs) =>
      prevSubs.filter((item) => item.id !== subscriptionId)
    );
  };

  const submitSubscription = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubscriptionError(null);
    setSubscriptionNotice(null);

    const keyword = subscriptionForm.keyword.trim();
    const price = Number(subscriptionForm.pricePerVideo);

    if (!keyword) {
      setSubscriptionError("Enter a keyword to subscribe.");
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      setSubscriptionError("Price per video must be greater than zero.");
      return;
    }

    const normalizedPrice = toPrecision(subscriptionForm.paymentMethod, price);

    const subscription: Subscription = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `sub-${Date.now()}`,
      keyword,
      pricePerVideo: normalizedPrice,
      paymentMethod: subscriptionForm.paymentMethod,
      status: "idle",
      gateway: settings.gateway,
      chain: settings.chain,
      totalCharged: 0,
      events: [],
      createdAt: new Date().toISOString(),
    };

    setSubscriptions((prev) => [subscription, ...prev]);
    setSubscriptionForm((prev) => ({
      ...prev,
      keyword: "",
    }));
    setSubscriptionNotice(
      `Ready to stream "${keyword}" videos at ${formatBalance(
        subscriptionForm.paymentMethod,
        normalizedPrice
      )}.`
    );
  };

  const activeSubscriptions = subscriptions.filter(
    (item) => item.status === "streaming"
  ).length;
  const isVideoProcessing =
    videoState.phase === "requesting" || videoState.phase === "rendering";

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <span className={`${styles.pill} ${styles.caps}`}>
            Foldspace Demo
          </span>
          <h1 className={styles.title}>
            Orchestrate video renders and live payment streams
          </h1>
          <p className={styles.subtitle}>
            Configure your gateway, pick a chain, and simulate how Foldspace
            coordinates on-chain payments for media generation. Submit a render
            request or subscribe to keywords that drip funds while new videos
            land in your queue.
          </p>
        </header>

        <section className={`${styles.surface} ${styles.settingsSection}`}>
          <div className={styles.settingsHeader}>
            <div>
              <h2>Environment settings</h2>
              <p className={styles.settingsHint}>
                Pick a gateway and chain once, and we will reuse it for every
                render request and payment stream.
              </p>
            </div>
          </div>

          <div className={styles.settingsGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Gateway</span>
              <select
                className={styles.select}
                value={settings.gateway}
                onChange={(event) =>
                  handleGatewayChange(event.target.value as Gateway)
                }
              >
                {GATEWAY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Chain</span>
              <select
                className={styles.select}
                value={settings.chain}
                onChange={(event) => handleChainChange(event.target.value)}
              >
                {CHAIN_OPTIONS[settings.gateway].map((chain) => (
                  <option key={chain} value={chain}>
                    {chain}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Default payment method</span>
              <select
                className={styles.select}
                value={videoState.paymentMethod}
                onChange={(event) =>
                  setVideoState((prev) => ({
                    ...prev,
                    paymentMethod: event.target.value as PaymentMethod,
                  }))
                }
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.label}
                  </option>
                ))}
              </select>
              <span className={styles.settingsHint}>
                Applies to new video requests. You can override per
                subscription.
              </span>
            </label>
          </div>

          <div className={styles.balances}>
            {PAYMENT_METHODS.map((method) => (
              <div key={method.id} className={styles.balanceCard}>
                <span className={styles.balanceLabel}>
                  {method.label} balance
                </span>
                <span className={styles.balanceValue}>
                  {formatBalance(method.id, balances[method.id])}
                </span>
                <div className={styles.quickActions}>
                  <button
                    type="button"
                    className={`${styles.button} ${styles.buttonSecondary}`}
                    onClick={() => handleTopUp(method.id)}
                  >
                    Add test funds
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className={styles.tabs}>
          <button
            className={`${styles.tabButton} ${
              activeView === "video" ? styles.tabButtonActive : ""
            }`}
            onClick={() => setActiveView("video")}
            type="button"
          >
            Generate Video
          </button>
          <button
            className={`${styles.tabButton} ${
              activeView === "subscriptions" ? styles.tabButtonActive : ""
            }`}
            onClick={() => setActiveView("subscriptions")}
            type="button"
          >
            Subscribe to Keywords
          </button>
        </div>

        <section className={`${styles.surface} ${styles.tabPanel}`}>
          {activeView === "video" ? (
            <>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Generate video from prompt</h2>
                <p className={styles.panelSubtitle}>
                  We will submit your request to {settings.gateway} on{" "}
                  {settings.chain}, collect payment in{" "}
                  {methodLabel(videoState.paymentMethod)}, and poll until the
                  render completes.
                </p>
              </div>

              <form className={styles.inlineForm} onSubmit={submitVideoRequest}>
                <label className={styles.field}>
                  <span className={styles.label}>Describe your video</span>
                  <textarea
                    className={styles.textarea}
                    value={videoState.prompt}
                    placeholder="Example: cinematic orbital shot of a futuristic city at sunset"
                    onChange={(event) =>
                      setVideoState((prev) => ({
                        ...prev,
                        prompt: event.target.value,
                      }))
                    }
                  />
                </label>

                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span className={styles.label}>Payment method</span>
                    <select
                      className={styles.select}
                      value={videoState.paymentMethod}
                      onChange={(event) =>
                        setVideoState((prev) => ({
                          ...prev,
                          paymentMethod: event.target.value as PaymentMethod,
                        }))
                      }
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.label} • cost{" "}
                          {formatBalance(
                            method.id,
                            VIDEO_COST[method.id]
                          )}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Chain</span>
                    <input
                      className={styles.input}
                      value={`${settings.chain} (via ${settings.gateway})`}
                      disabled
                    />
                  </label>
                </div>

                {videoState.error ? (
                  <div className={`${styles.status} ${styles.statusError}`}>
                    <span className={styles.statusMessage}>
                      {videoState.error}
                    </span>
                  </div>
                ) : null}

                {videoState.progress ? (
                  <div className={styles.status}>
                    <span
                      className={`${styles.statusBadge} ${
                        videoState.phase === "completed"
                          ? styles.statusSuccess
                          : ""
                      }`}
                    >
                      {videoState.phase === "completed"
                        ? "Completed"
                        : videoState.phase === "rendering"
                          ? "Rendering"
                          : "Processing"}
                    </span>
                    <p className={styles.statusMessage}>
                      {videoState.progress}
                    </p>
                  </div>
                ) : null}

                <div className={styles.actionsRow}>
                  <button
                    className={styles.button}
                    type="submit"
                    disabled={isVideoProcessing}
                  >
                    {isVideoProcessing
                      ? "Waiting for render…"
                      : `Pay ${formatBalance(
                          videoState.paymentMethod,
                          VIDEO_COST[videoState.paymentMethod]
                        )} and submit`}
                  </button>
                  <button
                    type="button"
                    className={`${styles.button} ${styles.buttonSecondary}`}
                    onClick={resetVideoFlow}
                  >
                    Reset
                  </button>
                </div>
              </form>

              <div className={styles.videoStage}>
                <div className={styles.videoMeta}>
                  <span>
                    Payment deducted in {methodLabel(videoState.paymentMethod)} •
                    remaining{" "}
                    {formatBalance(
                      videoState.paymentMethod,
                      balances[videoState.paymentMethod]
                    )}
                  </span>
                  <span>
                    Current chain: {settings.chain} • Gateway:{" "}
                    {settings.gateway}
                  </span>
                </div>

                {videoState.phase !== "completed" ? (
                  <div className={styles.videoPlaceholder}>
                    {videoState.phase === "rendering"
                      ? "Rendering in progress"
                      : "Awaiting render"}
                  </div>
                ) : (
                  <div className={styles.videoFrame}>
                    <video
                      key={videoState.videoUrl}
                      src={videoState.videoUrl}
                      controls
                      autoPlay
                      muted
                      loop
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>
                  Subscribe to keyword streams
                </h2>
                <p className={styles.panelSubtitle}>
                  Open a live payment stream that charges per delivered video.
                  Balances decrement as new assets arrive from {settings.gateway}{" "}
                  on {settings.chain}.
                </p>
              </div>

              <form className={styles.inlineForm} onSubmit={submitSubscription}>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span className={styles.label}>Keyword</span>
                    <input
                      className={styles.input}
                      placeholder="e.g. synthetic aurora timelapse"
                      value={subscriptionForm.keyword}
                      onChange={(event) =>
                        setSubscriptionForm((prev) => ({
                          ...prev,
                          keyword: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Price per video</span>
                    <input
                      className={styles.input}
                      type="number"
                      min="0"
                      step="0.01"
                      value={subscriptionForm.pricePerVideo}
                      onChange={(event) =>
                        setSubscriptionForm((prev) => ({
                          ...prev,
                          pricePerVideo: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Payment method</span>
                    <select
                      className={styles.select}
                      value={subscriptionForm.paymentMethod}
                      onChange={(event) =>
                        setSubscriptionForm((prev) => ({
                          ...prev,
                          paymentMethod: event.target.value as PaymentMethod,
                        }))
                      }
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {subscriptionError ? (
                  <div className={`${styles.status} ${styles.statusError}`}>
                    <span className={styles.statusMessage}>
                      {subscriptionError}
                    </span>
                  </div>
                ) : null}

                {subscriptionNotice ? (
                  <div className={`${styles.status} ${styles.statusSuccess}`}>
                    <span className={styles.statusMessage}>
                      {subscriptionNotice}
                    </span>
                  </div>
                ) : null}

                <div className={styles.actionsRow}>
                  <button className={styles.button} type="submit">
                    Add subscription
                  </button>
                  <div className={styles.settingsHint}>
                    Live streams: {activeSubscriptions}
                  </div>
                </div>
              </form>

              <div className={styles.divider} />

              {subscriptions.length === 0 ? (
                <div className={styles.emptyState}>
                  No keyword streams yet. Add one above to begin billing as new
                  videos arrive.
                </div>
              ) : (
                <div className={styles.subscriptionGrid}>
                  {subscriptions.map((sub) => (
                    <div key={sub.id} className={styles.subscriptionCard}>
                      <div className={styles.subscriptionHeader}>
                        <span className={styles.subscriptionKeyword}>
                          {sub.keyword}
                        </span>
                        <span className={styles.pill}>
                          {formatBalance(
                            sub.paymentMethod,
                            sub.pricePerVideo
                          )}{" "}
                          per video
                        </span>
                      </div>

                      <div className={styles.statusMessage}>
                        Streaming via {sub.gateway} on {sub.chain} • Created{" "}
                        {formatTimestamp(sub.createdAt)}
                      </div>

                      <div className={styles.videoMeta}>
                        <span>
                          Charged total:{" "}
                          {formatBalance(
                            sub.paymentMethod,
                            sub.totalCharged
                          )}
                        </span>
                        <span>
                          Status: {sub.status === "streaming" ? "Live" : "Idle"}
                        </span>
                      </div>

                      {sub.lastError ? (
                        <span className={styles.errorText}>{sub.lastError}</span>
                      ) : null}

                      {sub.events.length === 0 ? (
                        <div className={styles.emptyState}>
                          Waiting for the first video delivery.
                        </div>
                      ) : (
                        <div className={styles.eventList}>
                          {sub.events.map((event) => (
                            <div key={event.id} className={styles.eventItem}>
                              <div>{event.description}</div>
                              <div className={styles.eventMeta}>
                                <span>{formatTimestamp(event.timestamp)}</span>
                                <span className={styles.eventAmount}>
                                  {formatBalance(
                                    sub.paymentMethod,
                                    event.amount
                                  )}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className={styles.actionsRow}>
                        {sub.status === "streaming" ? (
                          <button
                            type="button"
                            className={`${styles.button} ${styles.buttonSecondary}`}
                            onClick={() => stopStream(sub.id)}
                          >
                            Pause stream
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => startStream(sub.id)}
                          >
                            Start stream
                          </button>
                        )}

                        <button
                          type="button"
                          className={`${styles.button} ${styles.buttonDanger}`}
                          onClick={() => removeSubscription(sub.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
