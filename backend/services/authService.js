const { validateInput } = require("../utils/authValidation/validator");
const bcrypt = require("bcrypt");
const { canSendVerification } = require("../utils/ratelimiting/rateLimiter");
const { resendEmail } = require("../utils/email/resend");
const supabase = require("../utils/supabase/supabaseClient");
const jwt = require("jsonwebtoken");

function authValidation(email, password) {
  if (!email || !password) {
    throw new Error("missing email and password!");
  }

  const { sanitizedEmail, sanitizedPassword } = validateInput(email, password);

  if (!sanitizedEmail || !sanitizedPassword) {
    throw new Error("Invalid input!");
  }

  return {
    sanitizedEmail: sanitizedEmail,
    sanitizedPassword: sanitizedPassword,
  };
}

async function signupUser(email, password) {
  if (!email || !password) {
    throw new Error("missing email and / or password!");
  }

  const { data: existingUser } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (existingUser) {
    throw new Error("User already exists in system!");
  }

  // hash password
  const hashed = await bcrypt.hash(password, 12);

  // insert user into database
  const { data, error } = await supabase
    .from("users")
    .insert([{ email, password: hashed, verified: true }]) // email verification is turned off in production
    .select("id")
    .single();

  if (error || !data) {
    if (error.message?.includes("duplicate key")) {
      const duplicateError = new Error("DUPLICATE_USERS");
      duplicateError.code = "DUPLICATE_USERS"; // custom code for the frontend
      throw duplicateError;
    }
    throw new Error("Error inserting user into database!");
  }

  console.log("Successfully signed up user!");

  // send verificaton email - currently turned off in production - cant send emails since I do not own the domain
  // try {
  //   const emailToken = generateEmailVerificationToken(email);
  //   await resendEmail(email, emailToken);
  // } catch (error) {
  //   throw new Error("Error sending verification email!");
  // }
}

async function loginUser(email, password) {
  if (!email || !password) {
    throw new Error("missing email and / or password!");
  }

  // retrieve user by email and compare hashes
  const { data: user, error } = await supabase
    .from("users")
    .select("id, email, password, verified")
    .eq("email", email)
    .single();

  if (error || !user) {
    const error = new Error("User not found!");
    error.status = 400;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  // email authentication is turned off in production
  if (!user.verified) {
    console.log("User exists but is not verified!");
    const error = new Error("User has not been verified!");
    error.code = "USER_NOT_VERIFIED";
    error.status = 401;
    try {
      // rate limiting to prevent attacks
      if (!canSendVerification(email)) {
        console.log("rate limit hit!");
        throw error;
      }
      // resend email verification
      const emailToken = generateEmailVerificationToken(email);
      await resendEmail(email, emailToken);
    } catch (err) {
      if (err.status === 401 && err.code === "USER_NOT_VERIFIED") {
        throw error;
      } else {
        console.log("Error: " + err);
        throw new Error("Error sending verification email!");
      }
    }

    throw error;
  }

  try {
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log("Could not find user in database!");
      throw new Error("Error: user is not signed up!");
    }

    const newTokens = generateTokens(user.id);

    if (!newTokens || !newTokens.access_token || !newTokens.refresh_token) {
      throw new Error("unable to generate tokens!");
    }

    return newTokens;
  } catch (error) {
    console.log("Error signing in user: " + error);
    throw new Error("Error logging in: " + error);
  }
}

function generateEmailVerificationToken(email) {
  if (!email) {
    console.log("Error: cannot generate a token without an email!");
  }

  try {
    const token = jwt.sign({ email }, process.env.EMAIL_VERIFICATION_SECRET, {
      expiresIn: "1d",
    });
    return token;
  } catch (tokenError) {
    console.log("Error generating token: " + tokenError);
    throw new Error("Failed to generate token!");
  }
}

function generateTokens(id) {
  if (!id) {
    throw new Error("No ID provided!");
  }

  const access_token = jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "15m",
  });

  const refresh_token = jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  if (!access_token || !refresh_token) {
    console.log("Failed to generate token!");
    throw new Error("Failed to generate token!");
  }

  return { access_token, refresh_token };
}

function validateToken(req) {
  const token = req.cookies?.["sb-access-token"]; // this is undefined

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    return userId;
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    throw new Error("Not authenticated!");
  }
}

// refreshes token for supabase user
function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw new Error("Missing token!");
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
  } catch (error) {
    console.log("Refreshing token failed: " + error);
    throw new Error("Failed to refresh token!");
  }

  const userId = decoded.id;
  if (!userId) {
    console.log("Couldnt retreive user id from verified token!");
    return res.status(401).json({ error: "Invalid refresh token payload" });
  }

  const newTokens = generateTokens(userId);
  if (newTokens) {
    return newTokens;
  } else {
    throw new Error("Failed to retrieve new tokens!");
  }
}

async function setAuthCookies(res, session) {
  try {
    // res.header("Access-Control-Allow-Credentials", "true");
    // res.header("Access-Control-Allow-Origin", process.env.CLIENT_URL);

    res.cookie("sb-access-token", session.access_token, {
      httpOnly: true,
      // secure: process.env.NODE_ENV === "production",
      // sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 15 * 60 * 1000, // expires in not defined!
    });

    res.cookie("sb-refresh-token", session.refresh_token, {
      httpOnly: true,
      // secure: process.env.NODE_ENV === "production",
      // sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 60 * 60 * 24 * 30 * 1000,
    });
  } catch (error) {
    console.error("Error setting auth cookies:", error);
    throw new Error("Failed to set authentication cookies");
  }
}

function clearAuthCookies(res) {
  res.clearCookie("sb-access-token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  });
  res.clearCookie("sb-refresh-token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  });
}

async function verifyUser(token) {
  if (!token) {
    console.log("Missing token in user verification");
    throw new Error("Missing authentication!");
  }

  try {
    // verify the access token
    const decoded = jwt.verify(token, process.env.EMAIL_VERIFICATION_SECRET);
    const email = decoded.email;

    const { data } = await supabase
      .from("users")
      .update({ verified: true })
      .eq("email", email)
      .select("*");

    const id = data?.[0]?.id;

    if (!id) {
      console.log("failed to return userId from supabase!");
      throw new Error("Missing returned Id");
    }

    const newSession = generateTokens(id);
    return newSession;
  } catch (error) {
    console.log("Failed to authenticate user: " + error);
    throw new Error("Failed to authentiate user!");
  }
}

module.exports = {
  authValidation,
  signupUser,
  loginUser,
  validateToken,
  refreshAccessToken,
  setAuthCookies,
  clearAuthCookies,
  verifyUser,
};
