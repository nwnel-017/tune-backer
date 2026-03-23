import { useNavigate } from "react-router-dom";
import { Player } from "@lottiefiles/react-lottie-player";
import Logo from "../components/Logo";
import Footer from "../components/Footer";
import styles from "../pages/styles/Home.module.css";

const LandingPage = () => {
  const navigate = useNavigate();
  return (
    <div className={styles.landingPage}>
      <div className={styles.contentContainer}>
        <div className={styles.innerContent}>
          <Logo />
          <div className={styles.landingContent}>
            <div className={styles.titleText}>TuneBacker</div>
            <div className={styles.subTitleText}>
              Keep your playlists safe for free - backup and restore anytime
            </div>
            <div className={styles.landingButtons}>
              {/* <button
                className={styles.signupBtnHollow}
                onClick={() => navigate("/signup")}
              >
                Sign Up
              </button> */}
              <button
                className={`${styles.loginBtnHollow} ${styles.footerText}`}
                onClick={() => navigate("/signup")}
              >
                Signup or Login
              </button>
            </div>
            <div className={styles.subContentText}>
              Create a TuneBacker account to securely store your playlist
              backups. You'll connect your Spotify account in the next step.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
