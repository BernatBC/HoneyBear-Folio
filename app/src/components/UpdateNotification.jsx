import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { createPortal } from "react-dom";
import { X, Download, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import "../styles/Modal.css";
import { t } from "../i18n/i18n";

// Set this to true to test the popup without a real update server
const TEST_MODE = false;

export default function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        let update;

        if (TEST_MODE) {
          // Mock update data for testing UI
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate network delay
          update = {
            available: true,
            version: "2.0.0-test",
            body: "## Test Update Available\n\nThis is a simulated update to test the notification UI.\n\n- **Feature**: Added update notifications\n- **Fix**: Improved performance",
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
      <div className="modal-container w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {t("update.title")}
          </h2>
          <button
            onClick={handleClose}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <X size={24} />
          </button>
        </div>

        <div className="mb-6">
          <p className="text-slate-600 dark:text-slate-300 mb-2">
            {t("update.available_text", { version: updateInfo?.version })}
          </p>

          {updateInfo?.body && (
            <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg text-sm text-slate-600 dark:text-slate-300 max-h-32 overflow-y-auto mb-4">
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
                    <h1 className="text-lg font-bold mt-2 mb-1" {...props} />
                  ),
                  h2: ({ node: _node, ...props }) => (
                    <h2 className="text-base font-bold mt-2 mb-1" {...props} />
                  ),
                  h3: ({ node: _node, ...props }) => (
                    <h3 className="text-sm font-bold mt-1 mb-1" {...props} />
                  ),
                  p: ({ node: _node, ...props }) => (
                    <p className="mb-1" {...props} />
                  ),
                }}
              >
                {updateInfo.body}
              </ReactMarkdown>
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

        <div className="flex justify-end gap-3">
          {!downloaded ? (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                disabled={downloading}
              >
                {t("update.later")}
              </button>
              <button
                onClick={handleUpdate}
                disabled={downloading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors w-full justify-center"
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
