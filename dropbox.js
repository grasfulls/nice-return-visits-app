// Dropbox connection for optional cloud backup. Uses the OAuth 2 code flow
// with PKCE, so no app secret is needed. The app only gets access to its own
// App folder in the user's Dropbox.
(() => {
  const APP_KEY = "mh9kxnee5gmu8xj";
  const STORE_KEY = "return_visits_dropbox";
  const PENDING_KEY = "return_visits_dropbox_pending";
  const RESULT_KEY = "return_visits_dropbox_result";

  const redirectUri = () =>
    window.location.origin + window.location.pathname.replace(/[^/]*$/, "");

  const base64Url = (bytes) =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const randomString = (length) =>
    base64Url(crypto.getRandomValues(new Uint8Array(length)));

  const readStore = () => {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch (error) {
      return null;
    }
  };
  const writeStore = (value) => {
    if (value) localStorage.setItem(STORE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORE_KEY);
  };

  const tokenRequest = async (params) => {
    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: APP_KEY, ...params }),
    });
    if (!response.ok) throw new Error(`Dropbox sign-in failed (${response.status}).`);
    return response.json();
  };

  const isConnected = () => Boolean(readStore()?.refreshToken);

  const startConnect = async () => {
    const verifier = randomString(48);
    const state = randomString(16);
    const challenge = base64Url(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        ),
      ),
    );
    localStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state }));
    const url = new URL("https://www.dropbox.com/oauth2/authorize");
    url.search = new URLSearchParams({
      client_id: APP_KEY,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      token_access_type: "offline",
      redirect_uri: redirectUri(),
      state,
    }).toString();
    window.location.href = url.toString();
  };

  // Runs when the page loads. If Dropbox just sent the user back, finish
  // signing in and leave a result note for the app to show.
  const finishConnectIfReturning = async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");
    if (!code && !error) return;
    const cleanedUrl = new URL(window.location.href);
    ["code", "state", "error", "error_description", "error_uri"].forEach(
      (key) => cleanedUrl.searchParams.delete(key),
    );
    window.history.replaceState(window.history.state, "", cleanedUrl.href);
    let pending = null;
    try {
      pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
    } catch (readError) {
      pending = null;
    }
    localStorage.removeItem(PENDING_KEY);
    const setResult = (value) =>
      sessionStorage.setItem(RESULT_KEY, JSON.stringify(value));
    if (error || !pending || pending.state !== params.get("state")) {
      setResult({
        ok: false,
        message: error
          ? "Dropbox was not connected because access was not allowed."
          : "Dropbox could not be connected. Please try again.",
      });
      return;
    }
    try {
      const token = await tokenRequest({
        grant_type: "authorization_code",
        code,
        code_verifier: pending.verifier,
        redirect_uri: redirectUri(),
      });
      writeStore({
        refreshToken: token.refresh_token,
        accessToken: token.access_token,
        expiresAt: Date.now() + token.expires_in * 1000 - 60000,
      });
      setResult({ ok: true });
    } catch (tokenError) {
      console.error(tokenError);
      setResult({
        ok: false,
        message: "Dropbox could not be connected. Please try again.",
      });
    }
  };

  const takeConnectResult = () => {
    const raw = sessionStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RESULT_KEY);
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  };

  const getAccessToken = async () => {
    const stored = readStore();
    if (!stored?.refreshToken) throw new Error("Dropbox is not connected.");
    if (stored.accessToken && stored.expiresAt > Date.now()) {
      return stored.accessToken;
    }
    const token = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: stored.refreshToken,
    });
    writeStore({
      ...stored,
      accessToken: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000 - 60000,
    });
    return token.access_token;
  };

  const apiError = async (response) => {
    const text = await response.text();
    const error = new Error(`Dropbox request failed (${response.status}). ${text}`);
    error.status = response.status;
    return error;
  };

  const rpc = async (endpoint, body) => {
    const response = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw await apiError(response);
    return response.json();
  };

  // With a rev, Dropbox only accepts the upload if the file is still that
  // version; otherwise it fails with status 409 (error.conflict is set).
  const upload = async (path, text, rev) => {
    const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path,
          mode: rev ? { ".tag": "update", update: rev } : "overwrite",
          autorename: false,
          mute: true,
        }),
      },
      body: new Blob([text], { type: "application/octet-stream" }),
    });
    if (!response.ok) {
      const error = await apiError(response);
      error.conflict = response.status === 409 && /conflict/.test(error.message);
      throw error;
    }
    return response.json();
  };

  const download = async (path) => {
    const response = await fetch(
      "https://content.dropboxapi.com/2/files/download",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await getAccessToken()}`,
          "Dropbox-API-Arg": JSON.stringify({ path }),
        },
      },
    );
    if (!response.ok) throw await apiError(response);
    return response.text();
  };

  const list = async () => {
    try {
      const result = await rpc("files/list_folder", { path: "" });
      let entries = result.entries;
      let cursor = result.cursor;
      let more = result.has_more;
      while (more) {
        const next = await rpc("files/list_folder/continue", { cursor });
        entries = entries.concat(next.entries);
        cursor = next.cursor;
        more = next.has_more;
      }
      return entries.filter((entry) => entry[".tag"] === "file");
    } catch (error) {
      // A brand-new app folder has nothing to list yet.
      if (error.status === 409) return [];
      throw error;
    }
  };

  const remove = (path) => rpc("files/delete_v2", { path });

  const accountEmail = async () => {
    const account = await rpc("users/get_current_account");
    return account.email || "";
  };

  const disconnect = async () => {
    try {
      const token = await getAccessToken();
      await fetch("https://api.dropboxapi.com/2/auth/token/revoke", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      console.error("Unable to revoke the Dropbox token:", error);
    }
    writeStore(null);
  };

  window.RVDropbox = {
    isConnected,
    startConnect,
    finishConnectIfReturning,
    takeConnectResult,
    upload,
    download,
    list,
    remove,
    accountEmail,
    disconnect,
    ready: finishConnectIfReturning(),
  };
})();
