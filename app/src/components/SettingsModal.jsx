import PropTypes from "prop-types";
import { X, Settings } from "lucide-react";
import "../styles/SettingsModal.css";

export default function SettingsModal({ onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <h2 className="modal-title">
            <Settings className="w-6 h-6 text-brand-400" />
            Settings
          </h2>
          <button onClick={onClose} className="modal-close-button">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-body">
          {/* Settings content will go here */}
          <p className="text-slate-400">Settings window is currently empty.</p>
        </div>
      </div>
    </div>
  );
}

SettingsModal.propTypes = {
  onClose: PropTypes.func.isRequired,
};
