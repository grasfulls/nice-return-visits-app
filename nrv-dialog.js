(function (root) {
  const queue = [];
  let active = false;

  function text(key, fallback) {
    return root.NRVI18n?.t(key, undefined, fallback) || fallback;
  }

  function present(message, confirmation) {
    return new Promise((resolve) => {
      queue.push({ message, confirmation, resolve });
      if (!active) showNext();
    });
  }

  function showNext() {
    const request = queue.shift();
    if (!request) {
      active = false;
      return;
    }

    active = true;
    const dialog = root.document.getElementById("nrv-message-dialog");
    const title = root.document.getElementById("nrv-message-title");
    const content = root.document.getElementById("nrv-message-content");
    const accept = root.document.getElementById("nrv-message-accept");
    const cancel = root.document.getElementById("nrv-message-cancel");
    const previousFocus = root.document.activeElement;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onClose);
      accept.removeEventListener("click", onAccept);
      cancel.removeEventListener("click", onReject);
      if (dialog.open) dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus();
      request.resolve(result);
      showNext();
    };
    const onCancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    const onClose = () => finish(false);
    const onAccept = () => finish(true);
    const onReject = () => finish(false);

    title.textContent = request.confirmation
      ? text("dialog.confirmTitle", "Confirm")
      : text("dialog.title", "Nice Return Visits");
    content.textContent = request.message;
    cancel.hidden = !request.confirmation;
    dialog.setAttribute(
      "role",
      request.confirmation ? "dialog" : "alertdialog",
    );
    accept.textContent = text("common.ok", "OK");
    cancel.textContent = text("common.cancel", "Cancel");
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClose);
    dialog.showModal();
    accept.addEventListener("click", onAccept);
    cancel.addEventListener("click", onReject);
    accept.focus();
  }

  root.NRVDialogs = {
    alert(message) {
      return present(String(message), false).then(() => undefined);
    },
    confirm(message) {
      return present(String(message), true);
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
