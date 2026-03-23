import React, { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
// import { signup } from "../services/SpotifyService";
// import { supabase } from "../supabase/supabaseClient";
import { signupUser } from "../services/AuthService";
import styles from "./styles/Home.module.css";
import { toast } from "react-toastify";
import { LoadingContext } from "../context/LoadingContext";

const SignupPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordReenter, setPasswordReenter] = useState("");
  const navigate = useNavigate();
  const { startLoading, stopLoading } = useContext(LoadingContext);

  const handleSignUp = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error("Please enter both email and password!");
      return;
    } else if (!passwordReenter) {
      toast.error("Please reenter your password");
      return;
    } else if (password !== passwordReenter) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      startLoading("overlay");
      await signupUser(email, password);
      toast.success(
        "Verification email has been sent! Please follow the link to verify your account",
      );
      //email verification currently disabled - cant send emails since I do not own the domain
      // toast.success("Account successfully created! Please log in to continue.");
      // navigate("/login");
    } catch (error) {
      console.log("Error signing up!");
      toast.error("There was an error signing up");
      return;
    } finally {
      stopLoading("overlay");
    }
  };

  const login = () => {
    navigate("/login");
  };
  return (
    <div className={`${styles.dashboard} ${styles.loginPage}`}>
      <h1>Sign Up</h1>
      <form onSubmit={handleSignUp} className={styles.loginForm}>
        <input
          className={styles.formInput}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        ></input>
        <input
          className={styles.formInput}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        ></input>
        <input
          className={styles.formInput}
          type="password"
          placeholder="Re-enter Password"
          value={passwordReenter}
          onChange={(e) => setPasswordReenter(e.target.value)}
        ></input>
      </form>
      <button onClick={handleSignUp} className={styles.submitButton}>
        Create Account
      </button>
      <div className={styles.dividerContainer}>
        <hr className={styles.divider} />
        <button
          onClick={login}
          className={`${styles.secondaryBtn} ${styles.smallText}`}
        >
          I Already Have an Account
        </button>
        <hr className={styles.divider} />
      </div>
    </div>
  );
};

export default SignupPage;
