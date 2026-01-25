import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { createPortal } from "react-dom";
import { Download, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import "../../styles/Modal.css";
import { t } from "../../i18n/i18n";
import { getDevSetting } from "../../config/dev-settings";

export default function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [showNotes, setShowNotes] = useState(false);

  const cleanReleaseNotes = (body) => {
    if (!body) return "";
    let cleaned = body.replace(/\s*\([^)]+\)\s*[—-]\s*@[\w-]+/g, "");
    cleaned = cleaned.replace(/\*\*Assets:\*\*[\s\S]*$/i, "");
    cleaned = cleaned.replace(/^# .*\n+/gm, "");
    return cleaned.trim();
  };

  useEffect(() => {
    const checkForUpdates = async () => {
      // Dev settings overrides
      if (getDevSetting("FORCE_HIDE_UPDATE_POPUP")) {
        return;
      }

      const forceShow = getDevSetting("FORCE_SHOW_UPDATE_POPUP");

      try {
        let update;

        if (forceShow) {
          // Mock update data for testing UI
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate network delay
          update = {
            available: true,
            version: "2.0.0-dev-test",
            body: "## Dev Test Update\n\nThis is a forced update notification from dev-settings.\n\n- **Feature**: Testing update notifications",
            downloadAndInstall: async (cb) => {
              // Simulate download process
              cb({ event: "Started", data: { contentLength: 100 } });
              for (let i = 0; i <= 10; i++) {
                await new Promise((r) => setTimeout(r, 300));
                cb({ event: "Progress", data: { chunkLength: 10 } });
              }
              cb({ event: "Finished" });
            },
          };
        } else {
          update = await check();
        }

        if (update?.available) {
          setUpdateAvailable(true);
          setUpdateInfo(update);
        }
      } catch (err) {
        console.error("Failed to check for updates:", err);
      }
    };

    checkForUpdates();
  }, []);

  const handleUpdate = async () => {
    if (!updateInfo) return;

    try {
      setDownloading(true);
      setError(null);

      let downloaded = 0;
      let contentLength = 0;

      await updateInfo.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case "Finished":
            setDownloaded(true);
            break;
        }
      });

      setDownloading(false);
      setDownloaded(true);
    } catch (err) {
      console.error("Failed to install update:", err);
      setError(err.message || t("update.failed_update"));
      setDownloading(false);
    }
  };

  const handleRelaunch = async () => {
    try {
      await relaunch();
    } catch (err) {
      console.error("Failed to relaunch:", err);
      setError(t("update.failed_relaunch"));
    }
  };

  const handleClose = () => {
    setUpdateAvailable(false);
  };

  if (!updateAvailable) return null;

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-container w-full max-w-md !pb-6 !min-h-0 h-auto">
        <div className="flex items-center mb-3">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {t("update.title")}
          </h2>
        </div>

        <div className="mb-3">
          <p className="text-slate-600 dark:text-slate-300 mb-2">
            {t("update.available_text", { version: updateInfo?.version })}
          </p>

          {updateInfo?.body && (
            <div className="mb-2">
              <button
                onClick={() => setShowNotes(!showNotes)}
                className={`flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium ${
                  showNotes ? "mb-2" : ""
                }`}
              >
                {showNotes ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
                {showNotes
                  ? t("update.hide_release_notes")
                  : t("update.show_release_notes")}
              </button>

              {showNotes && (
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg text-sm text-slate-600 dark:text-slate-300 max-h-32 overflow-y-auto">
                  <ReactMarkdown
                    components={{
                      ul: ({ node: _node, ...props }) => (
                        <ul className="list-disc pl-4" {...props} />
                      ),
                      ol: ({ node: _node, ...props }) => (
                        <ol className="list-decimal pl-4" {...props} />
                      ),
                      a: ({ node: _node, ...props }) => (
                        <a
                          className="text-blue-500 hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                          {...props}
                        />
                      ),
                      h1: ({ node: _node, ...props }) => (
                        <h1
                          className="text-lg font-bold mt-2 mb-1"
                          {...props}
                        />
                      ),
                      h2: ({ node: _node, ...props }) => (
                        <h2
                          className="text-base font-bold mt-2 mb-1"
                          {...props}
                        />
                      ),
                      h3: ({ node: _node, ...props }) => (
                        <h3
                          className="text-sm font-bold mt-1 mb-1"
                          {...props}
                        />
                      ),
                      p: ({ node: _node, ...props }) => (
                        <p className="mb-1" {...props} />
                      ),
                    }}
                  >
                    {cleanReleaseNotes(updateInfo.body)}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          {downloading && (
            <div className="mb-4">
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400 mb-1">
                <span>{t("update.downloading")}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {!downloaded ? (
            <>
              <button
                onClick={handleClose}
                className="btn-secondary"
                disabled={downloading}
              >
                {t("update.later")}
              </button>
              <button
                onClick={handleUpdate}
                disabled={downloading}
                className="btn-primary px-3 py-1.5"
              >
                {downloading ? (
                  <>
                    <RefreshCw className="animate-spin" size={18} />
                    {t("update.updating")}
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    {t("update.update_now")}
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={handleRelaunch}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors w-full justify-center"
            >
              <RefreshCw size={18} />
              {t("update.restart_apply")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
