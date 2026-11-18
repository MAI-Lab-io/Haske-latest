import React, { useState, useEffect } from "react";
import { auth } from "../firebaseConfig";
import { sendHaskeVerificationEmail } from "../utils/sendHaskeVerificationEmail";
import {
  onAuthStateChanged
} from "firebase/auth";
import { useNavigate } from "react-router-dom";
import "./VerifyPage.css";
import logo from "../assets/haske.png";
import aiWebBackground from "../assets/ai-web-background.png";

const VerifyPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    institution_name: "",
    institution_address: "",
    role: "",
    email: "",
    phone_number: "",
  });

  const [notification, setNotification] = useState("");
  const [institutions, setInstitutions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);

  const roles = ["Radiologist", "Radiographer", "Front Desk", "IT Specialist"];

  // Load institutions from the current Haske backend.
  // Never use a hardcoded fallback for access-related registration.
  useEffect(() => {
    let cancelled = false;

    const fetchInstitutions = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          "https://api.haske.online/api/institutions?source=manual&pageSize=1000",
          {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store"
          }
        );

        if (!response.ok) {
          throw new Error(
            `Institution service returned HTTP ${response.status}`
          );
        }

        const data = await response.json();

        // Support a raw array or commonly wrapped API responses.
        const list = Array.isArray(data)
          ? data
          : [
              data?.institutions,
              data?.data,
              data?.results,
              data?.data?.institutions
            ].find(Array.isArray);

        if (!Array.isArray(list)) {
          throw new Error("Unexpected institution response format.");
        }

        const names = [...new Set(
          list.map(item => {
            if (typeof item === "string") return item.trim();

            return String(
              item?.name ??
              item?.institution_name ??
              item?.institutionName ??
              ""
            ).trim();
          }).filter(Boolean)
        )];

        if (names.length === 0) {
          throw new Error("No registered institutions are available.");
        }

        if (!cancelled) {
          setInstitutions(names);
          setError(null);
        }

      } catch (err) {
        console.error("Institution loading failed:", err);

        if (!cancelled) {
          setInstitutions([]);
          setError(
            "Unable to load registered institutions. " +
            "Please refresh the page or contact Haske support."
          );
        }

      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchInstitutions();

    return () => {
      cancelled = true;
    };
  }, []);

    // Use the signed-in Firebase identity as the email source.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setFormData(prev => ({
          ...prev,
          email: user.email || ""
        }));
        setEmailVerified(user.emailVerified);
      } else {
        setEmailVerified(false);
        setNotification("Please sign in to complete your profile.");
      }
    });
    return () => unsubscribe();
  }, []);

  const checkEmailVerification = async () => {
    setVerificationLoading(true);
    setNotification("");

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("Please sign in first.");
      }

      await user.reload();
      setEmailVerified(user.emailVerified);

      setNotification(
        user.emailVerified
          ? "Your email address has been verified. You can now complete your profile."
          : "Your email has not been verified yet. Please open the verification link sent to your email address."
      );
    } catch (error) {
      setNotification(error.message || "Unable to check verification.");
    } finally {
      setVerificationLoading(false);
    }
  };

  const resendVerificationEmail = async () => {
    setVerificationLoading(true);
    setNotification("");

    try {
      const user = auth.currentUser;

      if (!user) {
        throw new Error("Please sign in first.");
      }

      await user.reload();

      if (user.emailVerified) {
        setEmailVerified(true);
        setNotification("Your email is already verified.");
        return;
      }

      await sendHaskeVerificationEmail(user);
      setNotification(
        "A verification email has been sent. Please check your inbox or spam folder."
      );
    } catch (error) {
      setNotification(
        error.message || "Unable to resend verification email."
      );
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setNotification("");

    try {
      await auth.authStateReady();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error("Please sign in to complete registration.");
      }

      await currentUser.reload();
      setEmailVerified(currentUser.emailVerified);

      if (!currentUser.emailVerified) {
        throw new Error(
          "Please verify your email address using the link sent to your inbox, then try again."
        );
      }

      const token = await currentUser.getIdToken(true);

      const response = await fetch(
        "https://api.haske.online/api/verification/submit-verification",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            ...formData,
            email: currentUser.email
          })
        }
      );

      const result = await response.json();

      if (response.ok) {
        setNotification(
          "Account Approval in progress..! You will be contacted shortly."
        );
        setFormData({
          first_name: "",
          last_name: "",
          institution_name: "",
          institution_address: "",
          role: "",
          email: "",
          phone_number: "",
        });
        navigate("/verify-waiting");
      } else {
        setNotification(
          "Error: " + (result.message || "An error occurred. Please try again.")
        );
      }
    } catch (error) {
      console.error("Error submitting verification:", error);
      setNotification(error.message || "An error occurred. Please try again.");
    }
  };

  return (
    <div className="verify-container">
      <div className="left-column">
        <div
          className="background-image-wrapper"
          style={{
            backgroundImage: `url(${aiWebBackground})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        ></div>
      </div>
      <div className="right-column">
        <div className="form-wrapper">
          <img src={logo} alt="Logo" className="logo" />
          <h2 className="form-title">Profile Setup</h2>
          
          {error && (
            <div className="verify-notification error">
{error}
            </div>
          )}

          <div className="verify-notification">
            {emailVerified
              ? "Your email address has been verified."
              : "Verify your email address before submitting your profile."}
          </div>

          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            marginBottom: "16px"
          }}>
            <button
              type="button"
              className="verify-button"
              onClick={checkEmailVerification}
              disabled={verificationLoading}
            >
              I've Verified My Email
            </button>

            {!emailVerified && (
              <button
                type="button"
                className="verify-button"
                onClick={resendVerificationEmail}
                disabled={verificationLoading}
              >
                Resend Verification Email
              </button>
            )}
          </div>

          <form className="verify-form" onSubmit={handleSubmit}>
            <input
              type="text"
              name="first_name"
              placeholder="First Name"
              value={formData.first_name}
              onChange={handleChange}
              required
              className="verify-input"
            />
            <input
              type="text"
              name="last_name"
              placeholder="Last Name"
              value={formData.last_name}
              onChange={handleChange}
              required
              className="verify-input"
            />
            
            {isLoading ? (
              <select
                name="institution_name"
                value={formData.institution_name}
                onChange={handleChange}
                required
                className="verify-select"
                disabled
              >
                <option value="">Loading institutions...</option>
              </select>
            ) : (
              <select
                name="institution_name"
                value={formData.institution_name}
                onChange={handleChange}
                required
                className="verify-select"
                disabled={!!error || institutions.length === 0}
              >
                <option value="">
                  {error ? "Institutions unavailable" : "Select Institution Name"}
                </option>
                {institutions.map((inst, index) => (
                  <option key={index} value={inst}>
                    {inst}
                  </option>
                ))}
              </select>
            )}

            <textarea
              name="institution_address"
              placeholder="Institution Address"
              value={formData.institution_address}
              onChange={handleChange}
              required
              className="verify-textarea"
            ></textarea>
            
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              required
              className="verify-select"
            >
              <option value="">Select Role</option>
              {roles.map((role, index) => (
                <option key={index} value={role}>
                  {role}
                </option>
              ))}
            </select>
            
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              required
              readOnly
              className="verify-input"
            />
            
            <input
              type="text"
              name="phone_number"
              placeholder="Phone Number"
              value={formData.phone_number}
              onChange={handleChange}
              required
              className="verify-input"
            />
            
            <button
              type="submit"
              className="verify-button"
              disabled={
                !emailVerified ||
                verificationLoading ||
                isLoading ||
                !!error ||
                !formData.institution_name ||
                !institutions.includes(formData.institution_name)
              }
            >
              Finish setting up my account
            </button>
          </form>

          {notification && <p className="verify-notification">{notification}</p>}
        </div>
      </div>
    </div>
  );
};

export default VerifyPage;
