import styles from "../pages/styles/Home.module.css";
import PrivacyPolicy from "../pages/PrivacyPolicy";
import { useState } from "react";

export default function Footer() {
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  function togglePrivacyPolicy() {
    setShowPrivacyPolicy(!showPrivacyPolicy);
  }

  return (
    <div>
      {/* {showPrivacyPolicy ? <PrivacyPolicy /> : ""} */}
      <div className={styles.footer}>
        <span>Spotify Required</span>
        <span>Control Your Playlists</span>
        <span onClick={() => togglePrivacyPolicy()}>Privacy Policy</span>
      </div>
    </div>
  );
}
