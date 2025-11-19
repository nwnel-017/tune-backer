import { useContext, useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LoadingContext } from "../context/LoadingContext";
import { useAuth } from "../context/AuthContext";
import Playlists from "./Playlists";
import Sidebar from "../components/Sidebar";
import Backups from "./Backups";
import Help from "./Help";
import AccountNotLinked from "../components/AccountNotLinked";
import PrivacyPolicy from "./PrivacyPolicy";
import UnlinkAccount from "../components/UnlinkAccount";
import defaultAvatar from "../assets/icons/default-avatar.png";
import {
  getSpotifyProfile,
  startSpotifyAuth,
} from "../services/SpotifyService";
import { useQueryClient } from "@tanstack/react-query";
import { logoutUser } from "../services/AuthService";
import { toast } from "react-toastify";
import "../App.css";
import styles from "./styles/Home.module.css";

const Home = () => {
  const queryClient = useQueryClient();
  const { user, authLoading } = useAuth();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const playlistRestored = params.get("playlistRestored");
  const fileRestored = params.get("fileRestored");
  const firstTimeUser = params.get("firstTimeUser");
  const [currentView, setCurrentView] = useState("playlists");

  const toastShown = useRef({ firstTimeUser: false, playlistRestored: false });

  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const {
    startLoading,
    stopLoading,
    active: isLoading,
  } = useContext(LoadingContext);
  const [accountNotLinked, setAccountNotLinked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewBackups, setViewBackups] = useState(false);
  const [viewHelpPage, setViewHelpPage] = useState(false);
  const [viewUnlinkAccount, setViewUnlinkAccount] = useState(false);

  const handleUnauthorized = async () => {
    console.log("User is not logged in. Redirecting to login page.");
    await logoutUser();
  };

  const linkAccount = async () => {
    try {
      await startSpotifyAuth("link");
    } catch (error) {
      throw new Error("Error linking account: " + error);
    }
  };

  const handleLogout = async () => {
    try {
      const res = await logoutUser();
      console.log(res);
    } catch (error) {
      throw new Error("Error ending user session: " + error);
    }
    queryClient.removeQueries(["playlists"]);
    queryClient.removeQueries(["backups"]);
    window.location.reload();
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const closeWindows = () => {
    setSidebarOpen(!sidebarOpen);
    setViewBackups(false);
    setViewHelpPage(false);
  };

  useEffect(() => {
    if (authLoading || !user) return;

    const fetchProfile = async () => {
      startLoading("page");
      try {
        const data = await getSpotifyProfile();
        setProfile(data);
      } catch (error) {
        console.error("Error fetching profile:", error);
        if (error.response && error.response.status === 401) {
          // Unauthorized - user has expired token
          handleUnauthorized();
        }
        if (error.response && error.response.status === 403) {
          console.log("Spotify account not linked");
          setAccountNotLinked(true);
        }
      } finally {
        stopLoading("page");
      }
    };

    fetchProfile();
  }, [authLoading, user]);

  useEffect(() => {
    if (profile) {
      setAccountNotLinked(false);
    }
  }, [profile]);

  useEffect(() => {
    if (firstTimeUser === "true" && !toastShown.current.firstTimeUser) {
      toast.success(
        "Welcome to TuneBacker! Select a playlist to keep safe. For help view the 'Help' page"
      );
      toastShown.current.firstTimeUser = true;
    }

    if (playlistRestored === "true" && !toastShown.current.playlistRestored) {
      toast.success(
        "Your playlist has been successfully restored! It will continue to be backed up automatically unless you remove it."
      );
      toastShown.current.playlistRestored = true;
    }

    if (fileRestored === "true" && !toastShown.current.fileRestored) {
      toast.success("Your playlist has been successfully restored!");
      toastShown.current.fileRestored = true;
    }

    if (firstTimeUser === "true" || playlistRestored === "true") {
      window.history.replaceState(null, "", "/home");
    }
  }, [playlistRestored, fileRestored, firstTimeUser]);

  const renderContent = () => {
    if (currentView === "help")
      return <Help onClose={() => setCurrentView("playlists")} />;

    if (currentView === "backups") return <Backups />;

    if (currentView === "privacy")
      return <PrivacyPolicy onClose={() => setCurrentView("playlists")} />;

    if (accountNotLinked)
      return <AccountNotLinked linkAccount={() => linkAccount()} />;

    return (
      <>
        <div>
          <header className={styles.header}>
            <img
              src={
                profile?.images.length > 0
                  ? profile.images[0].url
                  : defaultAvatar
              }
              alt="Profile"
              className={styles.profileImage}
            ></img>
            <h1 className={styles.headerText}>{profile?.display_name}</h1>
          </header>
          <Playlists profileLoaded={!!profile} stopParentLoader={stopLoading} />
        </div>
      </>
    );
  };

  return (
    <div className={styles.dashboard}>
      <link
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      ></link>
      <header className={styles.header}>
        <button onClick={() => toggleSidebar()} className={styles.menuIcon}>
          <span></span>
          <span></span>
          <span></span>
        </button>
      </header>
      <Sidebar
        isOpen={sidebarOpen}
        goHome={() => {
          setCurrentView("playlists");
          setSidebarOpen(!sidebarOpen);
        }}
        onClose={() => toggleSidebar()}
        viewBackups={() => {
          setCurrentView("backups");
          setSidebarOpen(!sidebarOpen);
        }}
        viewHelp={() => {
          setCurrentView("help");
          setSidebarOpen(!sidebarOpen);
        }}
        viewPrivacyPolicy={() => {
          setCurrentView("privacy");
          setSidebarOpen(!sidebarOpen);
        }}
        unlinkSpotify={() => {
          setViewUnlinkAccount(!viewUnlinkAccount);
          setSidebarOpen(!sidebarOpen);
        }}
        logout={() => handleLogout()}
      />
      <UnlinkAccount
        isOpen={viewUnlinkAccount}
        onClose={() => setViewUnlinkAccount(!viewUnlinkAccount)}
      />
      <div className={styles.componentContainer}>{renderContent()}</div>
    </div>
  );
};

export default Home;
