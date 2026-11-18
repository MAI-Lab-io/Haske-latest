import React, { useState, useEffect } from "react";
import { auth } from "../firebaseConfig";
import {
  onAuthStateChanged,
  sendEmailVerification
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

  // Fetch institutions from backend
  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        const response = await fetch("https://api.haske.online/api/institutions");
        if (!response.ok) {
          throw new Error("Failed to fetch institutions");
        }
        const data = await response.json();
        setInstitutions(data.map(inst => inst.name));
      } catch (err) {
        console.error("Error fetching institutions:", err);
        setError(err.message);
        // Fallback to default institutions if API fails
        setInstitutions([
          "CRESTVIEW RADIOLOGY LTD",
          "National Library of Medicine",
          "BTHDC LASUTH",
          "GEM DIAGNOSTIC CENTER",
          "OOUTH",
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInstitutions();
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
          ? "Email verified successfully. You can now submit your profile."
          : "Email not yet verified. Check your inbox and open the Firebase verification link."
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

      await sendEmailVerification(user);
      setNotification(
        "Verification email requested. Check your inbox and spam folder."
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
          "Please verify your email using the Firebase verification message, then try again."
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
              Warning: Couldn't fetch institutions. Using default list.
            </div>
          )}

          <div className="verify-notification">
            {emailVerified
              ? "Your Firebase email is verified."
              : "Verify your Firebase email before submitting your profile."}
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
              >
                <option value="">Select Institution Name</option>
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
              disabled={!emailVerified || verificationLoading}
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
