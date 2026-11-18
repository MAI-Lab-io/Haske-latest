import React, { useEffect, useState, useRef } from "react";
import { auth } from "../firebaseConfig";
import { useNavigate } from "react-router-dom";
import { logAction } from "../utils/analytics";
import "./ProtectedContent.css";

function ProtectedContent() {
    const [isVerified, setIsVerified] = useState(null);
    const [institutionName, setInstitutionName] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [selectedInstitution, setSelectedInstitution] = useState("");
    const [institutionsList, setInstitutionsList] = useState([]);
    const [loadingInstitutions, setLoadingInstitutions] = useState(false);
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    const imagingFrameRef = useRef(null);

    // The iframe requests an identity token only from the authenticated parent.
    useEffect(() => {
        const onImagingMessage = async (event) => {
            if (event.origin !== 'https://secure.haske.online' ||
                event.source !== imagingFrameRef.current?.contentWindow ||
                event.data?.type !== 'HASKE_IMAGING_READY' ||
                typeof event.data?.nonce !== 'string' ||
                !/^[a-f0-9]{32}$/.test(event.data.nonce) ||
                !isVerified) return;
            try {
                const user = auth.currentUser;
                if (!user) return;
                const token = await user.getIdToken();
                if (event.source !== imagingFrameRef.current?.contentWindow) return;
                event.source.postMessage({
                    type: 'HASKE_IMAGING_TOKEN',
                    nonce: event.data.nonce,
                    token
                }, 'https://secure.haske.online');
            } catch (error) {
                console.error('Imaging authentication failed', error);
            }
        };
        window.addEventListener('message', onImagingMessage);
        return () => window.removeEventListener('message', onImagingMessage);
    }, [isVerified]);

    useEffect(() => {
        const user = auth.currentUser;
        if (isVerified && user) {
            logAction('Protected Content Viewed', {
                isAdmin,
                isSuperAdmin,
                institutionName
            }, user);
        }
    }, [isVerified, isAdmin, isSuperAdmin, institutionName]);

    // HASKE_ACCOUNT_STATUS_ROUTING_V1
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        const checkAccount = async () => {
            try {
                await auth.authStateReady();
                if (cancelled) return;

                const user = auth.currentUser;

                if (!user?.email) {
                    navigate("/signin", { replace: true });
                    return;
                }

                logAction('Verification Check Started', {}, user);

                const response = await fetch(
                    `https://api.haske.online/api/verification/check-verification?email=${encodeURIComponent(user.email)}`,
                    {
                        signal: controller.signal,
                        cache: "no-store"
                    }
                );

                if (cancelled) return;

                if (response.status === 404) {
                    navigate("/verification", {
                        replace: true,
                        state: { email: user.email }
                    });
                    return;
                }

                if (!response.ok) {
                    throw new Error(
                        `Account verification failed (HTTP ${response.status})`
                    );
                }

                const data = await response.json();
                if (cancelled) return;

                if (data.isDeactivated) {
                    setError(
                        "Your Haske account has been deactivated. Contact an administrator."
                    );
                    setIsVerified(false);
                    return;
                }

                if (!data.isVerified) {
                    navigate("/verify-waiting", { replace: true });
                    return;
                }

                setInstitutionName(data.institutionName || "");
                setIsAdmin(Boolean(data.isAdmin));
                setIsSuperAdmin(Boolean(data.isSuperAdmin));
                setIsVerified(true);

                logAction('User Verified', {
                    institution: data.institutionName,
                    isAdmin: Boolean(data.isAdmin),
                    isSuperAdmin: Boolean(data.isSuperAdmin)
                }, user);

            } catch (error) {
                if (cancelled || error.name === "AbortError") return;

                console.error("Haske account verification failed:", error);

                setError(
                    "We could not verify your account status. Please try again."
                );
                setIsVerified(false);
            }
        };

        checkAccount();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [navigate]);

    useEffect(() => {
        if (isVerified && isSuperAdmin) {
            const user = auth.currentUser;
            logAction('Admin Institutions Load Started', {}, user);
            
            setLoadingInstitutions(true);
            setError(null);
            
            fetch("https://api.haske.online/api/institutions")
                .then((response) => response.json())
                .then((data) => {
                    if (data.success && Array.isArray(data.institutions)) {
                        setInstitutionsList(data.institutions);
                        logAction('Admin Institutions Loaded', {
                            count: data.institutions.length
                        }, user);
                    } else {
                        throw new Error(data.error || "Invalid response format");
                    }
                })
                .catch((error) => {
                    console.error("Error fetching institutions:", error);
                    setError("Failed to load institutions");
                    setInstitutionsList([]);
                    logAction('Admin Institutions Load Failed', {
                        error: error.message
                    }, user);
                })
                .finally(() => setLoadingInstitutions(false));
        }
    }, [isVerified, isSuperAdmin]);

    const handleSignOut = () => {
        const user = auth.currentUser;
        if (user) {
            logAction('Sign Out Initiated', {}, user);
            
            fetch('https://api.haske.online/api/verification/log-action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: user.email,
                    action: 'user signed out',
                }),
            })
                .then((response) => {
                    if (response.ok) {
                        logAction('Sign Out Logged', {}, user);
                    } else {
                        logAction('Sign Out Log Failed', {}, user);
                    }
                    return auth.signOut();
                })
                .then(() => {
                    logAction('User Signed Out', {}, user);
                    navigate("/", { state: { message: "Signed out successfully!" }, replace: true });
                })
                .catch((error) => {
                    console.error('Error during sign out:', error);
                    logAction('Sign Out Error', {
                        error: error.message
                    }, user);
                });
        }
    };

    const handleInstitutionChange = (event) => {
        const user = auth.currentUser;
        const newInstitution = event.target.value;
        setSelectedInstitution(newInstitution);
        
        logAction('Institution Filter Changed', {
            selectedInstitution: newInstitution
        }, user);
    };

    const handleFilterClick = () => {
        const user = auth.currentUser;
        logAction('Institution Filter Applied', {
            institution: selectedInstitution
        }, user);
        
        setInstitutionName(selectedInstitution);
    };

    const handleAdminPanelClick = () => {
        const user = auth.currentUser;
        logAction('Admin Panel Accessed', {}, user);
        navigate("/admin");
    };

    if (isVerified === null) {
        return <div>Loading...</div>;
    }
    
    if (isVerified === false) {
        return (
            <div className="protected-container" role="alert">
                <p>
                    {error ||
                        "Your Haske account is not authorised for imaging access."}
                </p>
            </div>
        );
    }

    const formattedInstitutionName = institutionName ? encodeURIComponent(institutionName) : "";

    const iframeSrc = isSuperAdmin
        ? `https://secure.haske.online/ui/app/#${selectedInstitution ? `filtered-studies?InstitutionName=${encodeURIComponent(selectedInstitution)}&order-by=Metadata,LastUpdate,DESC` : ""}`
        : isAdmin
            ? `https://secure.haske.online/ui/app/#filtered-studies?InstitutionName=${encodeURIComponent(institutionName)}&order-by=Metadata,LastUpdate,DESC`
            : `https://secure.haske.online/ui/app/#filtered-studies?InstitutionName=${formattedInstitutionName}&order-by=Metadata,LastUpdate,DESC`;

    return (
        <div className="protected-container">
            <iframe 
                ref={imagingFrameRef}
                src={iframeSrc} 
                title="Haske" 
                className="protected-iframe"
                onLoad={() => {
                    const user = auth.currentUser;
                    logAction('Study Viewer Loaded', {
                        url: iframeSrc,
                        isAdmin,
                        isSuperAdmin,
                        institution: isAdmin ? selectedInstitution : institutionName
                    }, user);
                }}
            ></iframe>
            <div className="overlay-container">
                {isSuperAdmin && (
                    <div className="filter-section">
                        {loadingInstitutions ? (
                            <div>Loading institutions...</div>
                        ) : error ? (
                            <div className="error-message">{error}</div>
                        ) : (
                            <>
                                <select 
                                    id="institutionFilter" 
                                    value={selectedInstitution} 
                                    onChange={handleInstitutionChange}
                                    disabled={institutionsList.length === 0}
                                >
                                    <option value="">All Institutions</option>
                                    {institutionsList.map((institution) => (
                                        <option key={institution.id} value={institution.name}>
                                            {institution.name}
                                        </option>
                                    ))}
                                </select>
                                <button 
                                    onClick={handleFilterClick} 
                                    className="filter-button"
                                    disabled={!selectedInstitution}
                                >
                                    Apply Filter
                                </button>
                            </>
                        )}
                    </div>
                )}
                <div className="signout-container">
                    {(isAdmin || isSuperAdmin) && (
                        <button 
                            onClick={handleAdminPanelClick} 
                            className="admin-button"
                        >
                            Admin Panel
                        </button>
                    )}
                    <button onClick={handleSignOut} className="signout-button">
                        Sign Out
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ProtectedContent;
