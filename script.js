// Global variables
const ADMIN_KEYS = {
    'admin-end': 'admin-end',
    'admin-natalia111': 'admin-natalia111'
};
let currentAdmin = null; // 'admin-end' or 'admin-natalia111'
let currentLevel = '';
let currentQuizQuestion = 0;
let quizAnswers = {};
let testAnswers = {};
// Firebase
let firebaseEnabled = false;
// Firebase config for your project (replace values if needed)
const firebaseConfig = {
    apiKey: "AIzaSyBrbwv0fT4xXS8j7YHHZ6pPWRcyCXUQ3Gc",
    authDomain: "englishhub-28.firebaseapp.com",
    // Common default Realtime Database URL pattern. If your DB uses a different URL, replace it.
    databaseURL: "https://englishhub-28-default-rtdb.firebaseio.com",
    projectId: "englishhub-28",
    storageBucket: "englishhub-28.firebasestorage.app",
    messagingSenderId: "440321285922",
    appId: "1:440321285922:web:3733472c65561096e64f7b",
    measurementId: "G-1DMNFRXK0Y"
};

function initFirebase() {
    if (window.firebase && firebaseConfig && firebaseConfig.apiKey !== 'YOUR_API_KEY') {
        try {
            firebase.initializeApp(firebaseConfig);

            // Test Realtime Database connectivity before enabling firebase features
            const dbRef = firebase.database().ref('/');
            dbRef.once('value', snap => {
                // DB reachable
                firebaseEnabled = true;

                // keep auth state in sync (if auth is available)
                if (firebase.auth) {
                    firebase.auth().onAuthStateChanged(u => {
                        if (u) {
                            localStorage.setItem('englishHub_signedInId', u.uid);
                            // ensure user profile exists in users list
                            firebase.database().ref(`/users/${u.uid}`).once('value').then(snap => {
                                const profile = snap.val();
                                if (profile) {
                                    const users = getAllUsers();
                                    if (!users.find(x => x.email === profile.email)) {
                                        const obj = Object.assign({ id: u.uid }, profile);
                                        users.push(obj);
                                        saveAllUsers(users);
                                    }
                                }
                            }).catch(()=>{});
                        } else {
                            localStorage.removeItem('englishHub_signedInId');
                        }
                    });
                }

                // pull remote data into localStorage (merge)
                firebase.database().ref('/users').once('value').then(snap => {
                    const remote = snap.val() || {};
                    const users = Object.keys(remote).map(k => Object.assign({ id: k }, remote[k]));
                    const local = getAllUsers();
                    users.forEach(u => {
                        if (!local.find(l => l.email === u.email)) {
                            local.push(u);
                        }
                    });
                    saveAllUsers(local);
                }).catch(()=>{});

                firebase.database().ref('/content').once('value').then(snap => {
                    const remote = snap.val() || {};
                    const local = getAllContent();
                    Object.keys(remote).forEach(level => {
                        local[level] = remote[level];
                    });
                    saveAllContent(local);
                }).catch(()=>{});

                firebase.database().ref('/feedbacks').once('value').then(snap => {
                    const remote = snap.val() || {};
                    const arr = Object.keys(remote).map(k => Object.assign({ id: k }, remote[k]));
                    saveAllFeedbacks(arr);
                }).catch(()=>{});

                firebase.database().ref('/submissions').once('value').then(snap => {
                    const remote = snap.val() || {};
                    const arr = Object.keys(remote).map(k => Object.assign({ id: k }, remote[k]));
                    saveAllTestSubmissions(arr);
                }).catch(()=>{});
            }, err => {
                console.warn('Realtime Database not reachable:', err);
                firebaseEnabled = false;
            });

        } catch (e) {
            console.warn('Firebase init failed', e);
            firebaseEnabled = false;
        }
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    loadAllContent();
    // initialize firebase (if config is provided)
    initFirebase();
    // ensure overlay blocks content for unsigned users
    ensureOverlay();

    // signup form
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const firstName = document.getElementById('firstName').value.trim();
            const lastName = document.getElementById('lastName').value.trim();
            const country = document.getElementById('country').value.trim();
            const email = document.getElementById('email').value.trim().toLowerCase();
            const password = document.getElementById('password').value;

            if (!firstName || !lastName || !country || !email || !password) return alert('Please fill all fields');

            const users = getAllUsers();
            // simple unique email check
            const existingUser = users.find(u => u.email === email);
            if (existingUser) {
                // If Firebase is enabled, try signing in with provided password
                if (firebaseEnabled && firebase.auth) {
                    firebase.auth().signInWithEmailAndPassword(email, password).then(cred => {
                        const uid = cred.user.uid;
                        signInUser(uid);
                        closeSignupModal();
                        ensureOverlay();
                        renderAdminOverview();
                        alert('Signed in successfully.');
                    }).catch(err => {
                        alert('An account with this email already exists. If this is your account, enter the correct password to sign in. (' + err.message + ')');
                    });
                } else {
                    // Local fallback: check stored password if present
                    if (existingUser.password && existingUser.password === password) {
                        signInUser(existingUser);
                        closeSignupModal();
                        ensureOverlay();
                        renderAdminOverview();
                        alert('Signed in successfully (local).');
                    } else {
                        // Prompt to sign in instead
                        const go = confirm('An account with this email already exists. Do you want to try signing in instead?');
                        if (go) {
                            if (existingUser.password && existingUser.password === password) {
                                signInUser(existingUser);
                                closeSignupModal();
                                ensureOverlay();
                                renderAdminOverview();
                                alert('Signed in successfully (local).');
                            } else {
                                alert('Cannot sign in: password did not match local record. Please use the login flow or reset your password.');
                            }
                        }
                    }
                }
                return;
            }

            if (firebaseEnabled && firebase.auth) {
                firebase.auth().createUserWithEmailAndPassword(email, password).then(cred => {
                    const uid = cred.user.uid;
                    const profile = {
                        firstName,
                        lastName,
                        country,
                        email,
                        createdAt: new Date().toISOString(),
                        lastVisit: new Date().toISOString(),
                        streak: 1
                    };
                    // save profile to realtime DB
                    firebase.database().ref(`/users/${uid}`).set(profile).then(() => {
                        // update local users cache
                        const local = getAllUsers();
                        local.push(Object.assign({ id: uid }, profile));
                        saveAllUsers(local);
                        // sign in locally
                        signInUser(uid);
                        closeSignupModal();
                        ensureOverlay();
                        renderAdminOverview();
                        alert('Account created and signed in. Enjoy learning!');
                    }).catch(err => {
                        alert('Failed saving profile: ' + err.message);
                    });
                }).catch(err => {
                    alert('Signup error: ' + err.message);
                });
            } else {
                const newUser = {
                    id: Date.now(),
                    firstName,
                    lastName,
                    country,
                    email,
                    password,
                    createdAt: new Date().toISOString(),
                    lastVisit: new Date().toISOString(),
                    streak: 1
                };
                users.push(newUser);
                saveAllUsers(users);
                signInUser(newUser);
                closeSignupModal();
                ensureOverlay();
                renderAdminOverview();
                alert('Account created and signed in!');
            }
        });
        document.getElementById('cancelSignup').addEventListener('click', closeSignupModal);
    }

    // feedback form
    const feedbackForm = document.getElementById('feedbackForm');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const message = document.getElementById('feedbackMessage').value.trim();
            if (!message) return alert('Please write a message');
            const user = getSignedInUser();
            const feedbacks = getAllFeedbacks();
            feedbacks.push({ id: Date.now(), message, userId: user ? user.id : null, name: user ? `${user.firstName} ${user.lastName}` : 'Anonymous', createdAt: new Date().toISOString() });
            saveAllFeedbacks(feedbacks);
            closeFeedbackModal();
            renderAdminOverview();
            alert('Thank you for your feedback!');
        });
        document.getElementById('cancelFeedback').addEventListener('click', closeFeedbackModal);
    }

    // Update day streak for signed in user
    const signed = getSignedInUser();
    if (signed) updateDayStreak(signed.id);
});

function initializeEventListeners() {
    // Search for admin access
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', function() {
        const v = this.value.trim().toLowerCase();
        if (!v) return;
        if (v === ADMIN_KEYS['admin-end']) {
            this.value = '';
            showAdminPanel('admin-end');
        } else if (v === ADMIN_KEYS['admin-natalia111']) {
            this.value = '';
            showAdminPanel('admin-natalia111');
        }
    });

    // Review form handlers
    const reviewForm = document.getElementById('reviewForm');
    if (reviewForm) {
        reviewForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const submissionId = document.getElementById('reviewSubmissionId').value;
            const message = document.getElementById('reviewMessage').value.trim();
            if (!message) return alert('Please write your corrections or comments.');

            const subs = getAllTestSubmissions();
            const idx = subs.findIndex(s => String(s.id) === String(submissionId));
            if (idx === -1) return alert('Submission not found');

            subs[idx].reviews = subs[idx].reviews || [];
            const review = {
                id: Date.now(),
                admin: 'Teacher',
                message,
                createdAt: new Date().toISOString()
            };
            subs[idx].reviews.push(review);
            saveAllTestSubmissions(subs);

            // mirror to firebase if enabled
            if (firebaseEnabled && firebase.database) {
                const key = subs[idx].id;
                firebase.database().ref(`/submissions/${key}/reviews`).set(subs[idx].reviews).catch(()=>{});
            }

            document.getElementById('reviewModal').classList.add('hidden');
            showAdminNotification('Review sent to student');

            // If the user has their profile page open, refresh it
            try { renderProfile(); } catch(e){}
        });

        document.getElementById('cancelReview').addEventListener('click', function() {
            document.getElementById('reviewModal').classList.add('hidden');
        });
    }
    // Allow Enter key to trigger admin access as well
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const v = this.value.trim().toLowerCase();
            if (v === ADMIN_KEYS['admin-end']) {
                this.value = '';
                showAdminPanel('admin-end');
            } else if (v === ADMIN_KEYS['admin-natalia111']) {
                this.value = '';
                showAdminPanel('admin-natalia111');
            }
        }
    });

    // Navigation
    document.getElementById('homeLink').addEventListener('click', (e) => {
        e.preventDefault();
        showHome();
         if (homeLink) homeLink.addEventListener('click', hideProfilePage);
    });
    document.getElementById('homeLink2').addEventListener('click', (e) => {
        e.preventDefault();
        showHome();
         if (homeLink2) homeLink2.addEventListener('click', hideProfilePage);
    });

    document.getElementById('backToHome').addEventListener('click', showHome);

    // Feedback link - open feedback modal
    const aboutLink = document.getElementById('aboutLink');
    if (aboutLink) {
        aboutLink.addEventListener('click', (e) => {
            e.preventDefault();
            openFeedbackModal();
        });
    }

    // Level cards
    document.querySelectorAll('.level-card').forEach(card => {
        card.addEventListener('click', function() {
            const level = this.dataset.level;
            if (!isSignedIn()) {
                openSignupModal();
                return;
            }
            showLevelDetail(level);
        });
    });

    // Tabs in level detail
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchTab(tabName);
        });
    });

    // Admin tabs
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.adminTab;
            switchAdminTab(tabName);
        });
    });

    // Admin level select
    document.getElementById('adminLevelSelect').addEventListener('change', function() {
        const level = this.value;
        if (level) {
            loadAdminContent(level);
        }
    });

    // Content type change
    document.getElementById('contentType').addEventListener('change', function() {
        generateDynamicFields(this.value);
    });

    // Add content form
    document.getElementById('addContentForm').addEventListener('submit', function(e) {
        e.preventDefault();
        addNewContent();
    });

    // Quiz controls
    document.getElementById('nextQuestion').addEventListener('click', nextQuizQuestion);
    document.getElementById('prevQuestion').addEventListener('click', prevQuizQuestion);
    document.getElementById('submitQuiz').addEventListener('click', submitQuiz);

    // Test submit
    document.getElementById('submitTest').addEventListener('click', submitTest);
}

// Show/Hide Pages
function showHome() {
    document.getElementById('homePage').classList.remove('hidden');
    document.getElementById('levelDetailPage').classList.add('hidden');
    document.getElementById('adminPanel').classList.add('hidden');
    document.title = 'English Hub';
}

function showLevelDetail(level) {
    currentLevel = level;
    document.getElementById('homePage').classList.add('hidden');
    document.getElementById('levelDetailPage').classList.remove('hidden');
    document.getElementById('levelTitle').textContent = getLevelName(level);
    document.title = `English Hub - ${getLevelName(level)}`;

    // Reset quiz and test
    currentQuizQuestion = 0;
    quizAnswers = {};
    testAnswers = {};

    // Load content for this level
    loadLevelContent(level);

    // Show lessons tab by default
    switchTab('lessons');
}

function showAdminPanel(adminKey) {
    currentAdmin = adminKey || null;
    document.getElementById('homePage').classList.add('hidden');
    document.getElementById('levelDetailPage').classList.add('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
    document.title = `English Hub - Admin (${currentAdmin || 'unknown'})`;

    // Default to manage levels
    switchAdminTab('manage-levels');

    // render admin overview (users, feedbacks, submissions) when admin-end logs in
    renderAdminOverview();
    // ensure overlay isn't blocking admin panel
    try { ensureOverlay(); } catch(e){}
}



/* ----------------- Authentication & Users (localStorage) ----------------- */

function getAllUsers() {
    const data = localStorage.getItem('englishHubUsers');
    return data ? JSON.parse(data) : [];
}

function saveAllUsers(users) {
    localStorage.setItem('englishHubUsers', JSON.stringify(users));
    if (firebaseEnabled) {
        // push users to realtime DB under /users using an auto-generated key
        const updates = {};
        users.forEach(u => {
            const key = u.id && String(u.id).length > 10 ? String(u.id) : firebase.database().ref().child('users').push().key;
            const copy = Object.assign({}, u);
            // ensure no password is pushed
            delete copy.password;
            updates[key] = copy;
        });
        firebase.database().ref('/users').set(updates).catch(()=>{});
    }
}

function signInUser(user) {
    if (!user) return;
    if (firebaseEnabled && typeof user === 'string') {
        localStorage.setItem('englishHub_signedInId', String(user));
    } else if (firebaseEnabled && user && user.uid) {
        localStorage.setItem('englishHub_signedInId', String(user.uid));
    } else if (user && user.id) {
        localStorage.setItem('englishHub_signedInId', String(user.id));
    } else if (typeof user === 'string' || typeof user === 'number') {
        localStorage.setItem('englishHub_signedInId', String(user));
    }
    try { if (typeof updateProfileNav === 'function') updateProfileNav(); } catch(e){}
    try { ensureOverlay(); } catch(e){}
}

function signOutUser() {
    if (firebaseEnabled && firebase.auth) {
        try { firebase.auth().signOut().catch(()=>{}); } catch(e){}
    }
    localStorage.removeItem('englishHub_signedInId');
    try { if (typeof updateProfileNav === 'function') updateProfileNav(); } catch(e){}
    try { ensureOverlay(); } catch(e){}
}

// Utility to update header profile nav visibility
function updateProfileNav() {
    const profileNav = document.getElementById('profileNavItem');
    if (!profileNav) return;
    profileNav.style.display = isSignedIn() ? 'inline-block' : 'none';
}

function getSignedInUser() {
    const id = localStorage.getItem('englishHub_signedInId');
    if (!id) return null;
    const users = getAllUsers();
    return users.find(u => String(u.id) === String(id)) || null;
}

function isSignedIn() {
    return !!getSignedInUser();
}

function openSignupModal() {
    document.getElementById('signupModal').classList.remove('hidden');
}

function closeSignupModal() {
    document.getElementById('signupModal').classList.add('hidden');
}

function openFeedbackModal() {
    document.getElementById('feedbackModal').classList.remove('hidden');
}

function closeFeedbackModal() {
    document.getElementById('feedbackModal').classList.add('hidden');
}

function ensureOverlay() {
    const overlay = document.getElementById('accessOverlay');
    const cover = document.getElementById('overlayCover');
    if (!overlay || !cover) return;
    // If an admin panel is open, do not block it with the overlay
    if (currentAdmin) {
        overlay.style.display = 'none';
        try { cover.onclick = null; } catch(e){}
        return;
    }
    if (!isSignedIn()) {
        overlay.style.display = 'block';
        // ensure clicking overlay opens signup modal
        cover.onclick = () => openSignupModal();
    } else {
        overlay.style.display = 'none';
        // remove click handler
        try { cover.onclick = null; } catch(e){}
    }
}

// Profile page handling
function showProfilePage() {
    document.getElementById('homePage').classList.add('hidden');
    document.getElementById('levelDetailPage').classList.add('hidden');
    document.getElementById('adminPanel').classList.add('hidden');
    document.getElementById('profilePage').classList.remove('hidden');
    renderProfile();
}

function hideProfilePage() {
    document.getElementById('profilePage').classList.add('hidden');
    showHome();
}

function renderProfile() {
    const user = getSignedInUser();
    const container = document.getElementById('profileInfo');
    const messages = document.getElementById('profileMessages');
    container.innerHTML = '';
    messages.innerHTML = '';
    if (!user) {
        container.innerHTML = '<p>Please sign up or sign in to view your profile.</p>';
        return;
    }
    container.innerHTML = `
        <p><strong>Name:</strong> ${escapeHtml(user.firstName || '')} ${escapeHtml(user.lastName || '')}</p>
        <p><strong>Email:</strong> ${escapeHtml(user.email || '')}</p>
        <p><strong>Country:</strong> ${escapeHtml(user.country || '')}</p>
        <p><strong>Streak:</strong> ${escapeHtml(String(user.streak || 0))}</p>
    `;
    // Show reviews sent back by admins for this user's submissions
    const submissions = getAllTestSubmissions().filter(s => String(s.userId) === String(user.id));
    const reviews = [];
    submissions.forEach(s => {
        if (s.reviews && Array.isArray(s.reviews)) {
            s.reviews.forEach(r => { reviews.push(Object.assign({ submissionId: s.id }, r)); });
        }
    });
    if (reviews.length > 0) {
        let html = '<div style="margin-top:1rem; background:white; padding:1rem; border-radius:12px; box-shadow:var(--shadow);">';
        html += '<h4>Reviews & Corrections</h4>';
        reviews.slice().reverse().forEach(r => {
            html += `<div style="border-bottom:1px solid #eee; padding:0.6rem 0;"><div style="font-size:0.95rem; color:var(--gray)"><strong>From:</strong> ${escapeHtml(r.admin)} • <small>${new Date(r.createdAt).toLocaleString()}</small></div><div style="margin-top:0.4rem">${escapeHtml(r.message)}</div>`;
            if (!r.read) {
                html += ` <div style="margin-top:0.5rem;"><button class="btn btn-sm" onclick="markReviewRead(${r.submissionId}, ${r.id})">Mark as read</button> <button class="btn btn-danger btn-sm" onclick="deleteReview(${r.submissionId}, ${r.id})">Delete</button></div>`;
            } else {
                html += `<div style="margin-top:0.5rem;"><span style="color:var(--gray); font-size:0.9rem;">Read</span> <button class="btn btn-danger btn-sm" onclick="deleteReview(${r.submissionId}, ${r.id})">Delete</button></div>`;
            }
            html += '</div>';
        });
        html += '</div>';
        messages.innerHTML = html;
    }
}

// Mark a review as read for a specific submission
function markReviewRead(submissionId, reviewId) {
    const subs = getAllTestSubmissions();
    const idx = subs.findIndex(s => String(s.id) === String(submissionId));
    if (idx === -1) return alert('Submission not found');
    const revIdx = (subs[idx].reviews || []).findIndex(r => String(r.id) === String(reviewId));
    if (revIdx === -1) return alert('Review not found');
    subs[idx].reviews[revIdx].read = true;
    saveAllTestSubmissions(subs);
    if (firebaseEnabled && firebase.database) {
        firebase.database().ref(`/submissions/${submissionId}/reviews`).set(subs[idx].reviews).catch(()=>{});
    }
    renderProfile();
}

// Delete a review for a student's profile
function deleteReview(submissionId, reviewId) {
    if (!confirm('Delete this review?')) return;
    const subs = getAllTestSubmissions();
    const idx = subs.findIndex(s => String(s.id) === String(submissionId));
    if (idx === -1) return alert('Submission not found');
    const revIdx = (subs[idx].reviews || []).findIndex(r => String(r.id) === String(reviewId));
    if (revIdx === -1) return alert('Review not found');
    subs[idx].reviews.splice(revIdx, 1);
    saveAllTestSubmissions(subs);
    if (firebaseEnabled && firebase.database) {
        firebase.database().ref(`/submissions/${submissionId}/reviews`).set(subs[idx].reviews).catch(()=>{});
    }
    renderProfile();
}

// Delete a submission (for Natalia admin)
function deleteSubmission(submissionId) {
    if (!confirm('Delete this submission?')) return;
    const subs = getAllTestSubmissions();
    const idx = subs.findIndex(s => String(s.id) === String(submissionId));
    if (idx === -1) return alert('Submission not found');
    subs.splice(idx, 1);
    saveAllTestSubmissions(subs);
    if (firebaseEnabled && firebase.database) {
        firebase.database().ref(`/submissions/${submissionId}`).remove().catch(()=>{});
    }
    renderAdminOverview();
}

// Open review modal for admin to add corrections/comments
function openReviewModal(submissionId) {
    const subs = getAllTestSubmissions();
    const sub = subs.find(s => String(s.id) === String(submissionId));
    if (!sub) return alert('Submission not found');
    document.getElementById('reviewSubmissionId').value = sub.id;
    const info = document.getElementById('reviewSubmissionInfo');
    info.innerHTML = '';
    info.innerHTML += `<div><strong>Name:</strong> ${escapeHtml(sub.name)}</div>`;
    info.innerHTML += `<div><strong>Level:</strong> ${escapeHtml(sub.level)}</div>`;
    info.innerHTML += `<div style="margin-top:8px;"><strong>Answers:</strong></div>`;
    Object.keys(sub.answers || {}).forEach(k => {
        info.innerHTML += `<div><strong>Q${Number(k)+1}:</strong> ${escapeHtml(String(sub.answers[k]))}</div>`;
    });
    document.getElementById('reviewMessage').value = '';
    document.getElementById('reviewModal').classList.remove('hidden');
}

// Hook up profile link and buttons on load
document.addEventListener('DOMContentLoaded', function() {
    const profileNav = document.getElementById('profileNavItem');
    const profileLink = document.getElementById('profileLink');
    const backFromProfile = document.getElementById('backFromProfile');
    const editProfileBtn = document.getElementById('editProfileBtn');
    const viewStreakBtn = document.getElementById('viewStreakBtn');
    const sendFeedbackBtn = document.getElementById('sendFeedbackFromProfile');

    function updateProfileNav() {
        const signed = isSignedIn();
        if (profileNav) profileNav.style.display = signed ? 'inline-block' : 'none';
    }
    updateProfileNav();

    if (profileLink) profileLink.addEventListener('click', function(e) { e.preventDefault(); showProfilePage(); });
    if (backFromProfile) backFromProfile.addEventListener('click', hideProfilePage);
    if (editProfileBtn) editProfileBtn.addEventListener('click', function() { const u = getSignedInUser(); if (!u) return openSignupModal(); openEditUserModal(u.id); });
    if (viewStreakBtn) viewStreakBtn.addEventListener('click', function() { const u = getSignedInUser(); if (!u) return alert('Please sign in'); alert('Current streak: ' + (u.streak || 0)); });
    if (sendFeedbackBtn) sendFeedbackBtn.addEventListener('click', function() { openFeedbackModal(); });

    // update nav visibility when users change
    window.addEventListener('storage', updateProfileNav);
});

/* ----------------- Feedback & Submissions (localStorage) ----------------- */
function getAllFeedbacks() {
    const data = localStorage.getItem('englishHubFeedbacks');
    return data ? JSON.parse(data) : [];
}

function saveAllFeedbacks(items) {
    localStorage.setItem('englishHubFeedbacks', JSON.stringify(items));
    if (firebaseEnabled) {
        const updates = {};
        items.forEach(i => { updates[i.id] = i; });
        firebase.database().ref('/feedbacks').set(updates).catch(()=>{});
    }
}

function getAllTestSubmissions() {
    const data = localStorage.getItem('englishHubTestSubmissions');
    return data ? JSON.parse(data) : [];
}

function saveAllTestSubmissions(items) {
    localStorage.setItem('englishHubTestSubmissions', JSON.stringify(items));
    if (firebaseEnabled) {
        const updates = {};
        items.forEach(i => { updates[i.id] = i; });
        firebase.database().ref('/submissions').set(updates).catch(()=>{});
    }
}

// Helper functions
function getLevelName(level) {
    const names = {
        'a1': 'A1 - Beginner',
        'a2': 'A2 - Elementary',
        'b1': 'B1 - Intermediate',
        'b2': 'B2 - Upper Intermediate',
        'c1': 'C1 - Advanced',
        'c2': 'C2 - Proficient'
    };
    return names[level] || level.toUpperCase();
}

function switchTab(tabName) {
    // Update tabs
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('active');
    });
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');

    // Update content
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');

    // Special handling for quiz
    if (tabName === 'quiz') {
        loadQuiz();
    } else if (tabName === 'test') {
        loadTestQuestions();
    }
}

function switchAdminTab(tabName) {
    document.querySelectorAll('.admin-tab').forEach(t => {
        t.classList.remove('active');
    });
    document.querySelector(`.admin-tab[data-admin-tab="${tabName}"]`).classList.add('active');

    document.querySelectorAll('.admin-content').forEach(c => {
        c.classList.add('hidden');
    });
    document.getElementById(tabName).classList.remove('hidden');
}

// Data Management with LocalStorage
function getAllContent() {
    const data = localStorage.getItem('englishHubContent');
    return data ? JSON.parse(data) : {
        a1: { lessons: [], vocabulary: [], quiz: [], test: [], stories: [] },
        a2: { lessons: [], vocabulary: [], quiz: [], test: [], stories: [] },
        b1: { lessons: [], vocabulary: [], quiz: [], test: [], stories: [] },
        b2: { lessons: [], vocabulary: [], quiz: [], test: [], stories: [] },
        c1: { lessons: [], vocabulary: [], quiz: [], test: [], stories: [] },
        c2: { lessons: [], vocabulary: [], quiz: [], test: [], stories: [] }
    };
}

function saveAllContent(data) {
    localStorage.setItem('englishHubContent', JSON.stringify(data));
    if (firebaseEnabled) {
        // push content under /content
        firebase.database().ref('/content').set(data).catch(()=>{});
    }
}

function loadAllContent() {
    // Initialize with sample data if empty
    const content = getAllContent();
    if (Object.values(content).every(level => 
        level.lessons.length === 0 && 
        level.vocabulary.length === 0 && 
        level.quiz.length === 0 && 
        level.test.length === 0 && 
        level.stories.length === 0
    )) {
        // Add sample content
        const sampleData = {
            a1: {
                lessons: [
                    { id: 1, title: "Greetings and Introductions", content: "Learn how to say hello, goodbye, and introduce yourself.", media: { type: "image", url: "https://via.placeholder.com/600x400?text=Greeting+People" } },
                    { id: 2, title: "Numbers 1-20", content: "Practice counting from 1 to 20 with examples.", media: { type: "audio", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" } }
                ],
                vocabulary: [
                    { id: 1, word: "Hello", translation: "مرحبا", pronunciation: "/həˈloʊ/", example: "Hello, how are you?", media: { type: "image", url: "https://via.placeholder.com/300?text=Hello" } },
                    { id: 2, word: "Thank you", translation: "شكرا", pronunciation: "/θæŋk ju/", example: "Thank you for your help." }
                ],
                quiz: [
                    { id: 1, question: "How do you say 'مرحبا' in English?", options: ["Goodbye", "Hello", "Please", "Sorry"], answer: 1 },
                    { id: 2, question: "What is the opposite of 'Hello'?", options: ["Hi", "Goodbye", "Thanks", "Please"], answer: 1 }
                ],
                test: [
                    { id: 1, question: "Write a short introduction about yourself (3-5 sentences)." },
                    { id: 2, question: "Translate: 'My name is Ahmed and I am from Egypt.'" }
                ],
                stories: [
                    { id: 1, title: "My First Day", content: "Today is my first day at school. I am very happy. I meet my teacher. Her name is Miss Sarah. She is very nice.", media: { type: "image", url: "https://via.placeholder.com/600x400?text=First+Day+at+School" } }
                ]
            }
            // Add more sample data for other levels if needed
        };
        // Merge sample data
        const fullData = getAllContent();
        Object.keys(sampleData).forEach(level => {
            Object.keys(sampleData[level]).forEach(type => {
                if (fullData[level][type].length === 0) {
                    fullData[level][type] = sampleData[level][type];
                }
            });
        });
        saveAllContent(fullData);
    }
}

function loadLevelContent(level) {
    const content = getAllContent()[level];

    // Lessons
    const lessonsContainer = document.getElementById('lessonsContainer');
    lessonsContainer.innerHTML = '';
    if (content.lessons.length === 0) {
        lessonsContainer.innerHTML = '<p class="loading">No lessons available yet.</p>';
    } else {
        content.lessons.forEach(lesson => {
            const card = document.createElement('div');
            card.className = 'lesson-card';
            card.innerHTML = `
                <h3 class="lesson-title">${lesson.title}</h3>
                <p>${lesson.content}</p>
                ${lesson.media ? renderMedia(lesson.media) : ''}
            `;
            lessonsContainer.appendChild(card);
        });
    }

    // Vocabulary
    const vocabContainer = document.getElementById('vocabContainer');
    vocabContainer.innerHTML = '';
    if (content.vocabulary.length === 0) {
        vocabContainer.innerHTML = '<p class="loading">No vocabulary cards available yet.</p>';
    } else {
        content.vocabulary.forEach(vocab => {
            const card = document.createElement('div');
            card.className = 'vocab-card';
            card.innerHTML = `
                <h3 class="vocab-word">${vocab.word} ${vocab.pronunciation ? `<small>(${vocab.pronunciation})</small>` : ''}</h3>
                ${vocab.translation ? `<p class="vocab-translation">${vocab.translation}</p>` : ''}
                ${vocab.example ? `<p><em>${vocab.example}</em></p>` : ''}
                ${vocab.media ? renderMedia(vocab.media) : ''}
            `;
            vocabContainer.appendChild(card);
        });
    }

    // Stories
    const storiesContainer = document.getElementById('storiesContainer');
    storiesContainer.innerHTML = '';
    if (content.stories.length === 0) {
        storiesContainer.innerHTML = '<p class="loading">No stories available yet.</p>';
    } else {
        content.stories.forEach(story => {
            const card = document.createElement('div');
            card.className = 'story-card';
            card.innerHTML = `
                <h3 class="story-title">${story.title}</h3>
                <p>${story.content}</p>
                ${story.media ? renderMedia(story.media) : ''}
            `;
            storiesContainer.appendChild(card);
        });
    }
}

function renderMedia(media) {
    if (!media || !media.url) return '';
    
    let html = '<div class="media-container">';
    if (media.type === 'image') {
        html += `<img src="${media.url}" alt="Media" onerror="this.style.display='none'">`;
    } else if (media.type === 'video') {
        html += `<video controls><source src="${media.url}" type="video/mp4">Your browser does not support the video tag.</video>`;
    } else if (media.type === 'audio') {
        html += `<audio controls class="audio-player"><source src="${media.url}" type="audio/mpeg">Your browser does not support the audio element.</audio>`;
    }
    html += '</div>';
    return html;
}

// Quiz Functions
function loadQuiz() {
    const content = getAllContent()[currentLevel];
    const quizContainer = document.getElementById('quizContainer');
    const controls = document.getElementById('quizControls');
    
    if (content.quiz.length === 0) {
        quizContainer.innerHTML = '<p class="loading">No quiz questions available yet.</p>';
        controls.classList.add('hidden');
        return;
    }

    quizContainer.innerHTML = '';
    controls.classList.remove('hidden');

    content.quiz.forEach((q, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'quiz-question';
        questionDiv.style.display = index === 0 ? 'block' : 'none';
        questionDiv.dataset.index = index;

        let optionsHtml = '<div class="options">';
        q.options.forEach((option, i) => {
            optionsHtml += `
                <div class="option" data-value="${i}">
                    ${String.fromCharCode(65 + i)}. ${option}
                </div>
            `;
        });
        optionsHtml += '</div>';

        questionDiv.innerHTML = `
            <h4>Question ${index + 1}: ${q.question}</h4>
            ${optionsHtml}
        `;

        // Add event listeners to options
        questionDiv.querySelectorAll('.option').forEach(option => {
            option.addEventListener('click', function() {
                // Remove previous selection
                this.parentElement.querySelectorAll('.option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                // Select current
                this.classList.add('selected');
                // Save answer
                quizAnswers[index] = parseInt(this.dataset.value);
            });
        });

        quizContainer.appendChild(questionDiv);
    });

    // Show submit button if on last question
    updateQuizControls();
}

function updateQuizControls() {
    const questions = document.querySelectorAll('.quiz-question');
    const prevBtn = document.getElementById('prevQuestion');
    const nextBtn = document.getElementById('nextQuestion');
    const submitBtn = document.getElementById('submitQuiz');

    prevBtn.classList.toggle('hidden', currentQuizQuestion === 0);
    nextBtn.classList.toggle('hidden', currentQuizQuestion === questions.length - 1);
    submitBtn.classList.toggle('hidden', currentQuizQuestion !== questions.length - 1);
}

function nextQuizQuestion() {
    const questions = document.querySelectorAll('.quiz-question');
    if (currentQuizQuestion < questions.length - 1) {
        questions[currentQuizQuestion].style.display = 'none';
        currentQuizQuestion++;
        questions[currentQuizQuestion].style.display = 'block';
        updateQuizControls();
    }
}

function prevQuizQuestion() {
    const questions = document.querySelectorAll('.quiz-question');
    if (currentQuizQuestion > 0) {
        questions[currentQuizQuestion].style.display = 'none';
        currentQuizQuestion--;
        questions[currentQuizQuestion].style.display = 'block';
        updateQuizControls();
    }
}

function submitQuiz() {
    const content = getAllContent()[currentLevel];
    let correct = 0;
    let total = content.quiz.length;

    content.quiz.forEach((q, index) => {
        if (quizAnswers[index] === q.answer) {
            correct++;
        }
    });

    const percentage = Math.round((correct / total) * 100);
    const result = document.getElementById('quizResult');
    result.innerHTML = `
        <div style="background: white; padding: 2rem; border-radius: 12px; text-align: center; box-shadow: var(--shadow);">
            <h3 style="color: ${percentage >= 70 ? 'var(--success)' : 'var(--warning)'}">
                Quiz Complete! ${percentage >= 70 ? 'Well Done!' : 'Keep Practicing!'}
            </h3>
            <p style="font-size: 1.5rem; margin: 1rem 0;">Score: ${correct}/${total} (${percentage}%)</p>
            <button class="btn btn-primary" onclick="loadQuiz()">Try Again</button>
        </div>
    `;
    result.classList.remove('hidden');
    document.getElementById('quizControls').classList.add('hidden');
}

// Test Functions
function loadTestQuestions() {
    const content = getAllContent()[currentLevel];
    const testContainer = document.getElementById('testContainer');

    if (content.test.length === 0) {
        testContainer.innerHTML = '<p class="loading">No test questions available yet.</p>';
        document.getElementById('submitTest').classList.add('hidden');
        return;
    }

    testContainer.innerHTML = '';
    document.getElementById('submitTest').classList.remove('hidden');

    content.test.forEach((q, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'test-question';
        questionDiv.innerHTML = `
            <h4>Question ${index + 1}: ${q.question}</h4>
            <textarea placeholder="Write your answer here..." required></textarea>
        `;
        testContainer.appendChild(questionDiv);
    });
}

function submitTest() {
    const answers = {};
    document.querySelectorAll('.test-question').forEach((q, index) => {
        const textarea = q.querySelector('textarea');
        if (textarea) {
            answers[index] = textarea.value.trim();
        }
    });

    // Save to localStorage as a test submission
    const user = getSignedInUser();
    const submissions = getAllTestSubmissions();
    submissions.push({
        id: Date.now(),
        userId: user ? user.id : null,
        name: user ? `${user.firstName} ${user.lastName}` : 'Anonymous',
        level: currentLevel,
        answers,
        submittedAt: new Date().toISOString()
    });
    saveAllTestSubmissions(submissions);

    const result = document.getElementById('testResult');
    result.innerHTML = `
        <div style="background: white; padding: 2rem; border-radius: 12px; box-shadow: var(--shadow);">
            <h3 style="color: var(--primary)">Test Submitted!</h3>
            <p>Your answers have been recorded. The teacher will review them soon.</p>
            <button class="btn btn-primary" onclick="location.reload()">Back to Level</button>
        </div>
    `;
    result.classList.remove('hidden');
    document.getElementById('submitTest').classList.add('hidden');
    // Update admin views
    renderAdminOverview();
}

// Update day streak when user visits
function updateDayStreak(userId) {
    const users = getAllUsers();
    const user = users.find(u => String(u.id) === String(userId));
    if (!user) return;
    const last = user.lastVisit ? new Date(user.lastVisit) : null;
    const today = new Date();
    const diff = last ? Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - new Date(last.getFullYear(), last.getMonth(), last.getDate())) / (1000*60*60*24)) : null;
    if (diff === 1) {
        user.streak = (user.streak || 1) + 1;
    } else if (diff === 0) {
        // same day - do nothing
    } else {
        user.streak = 1;
    }
    user.lastVisit = today.toISOString();
    saveAllUsers(users);
}

function renderAdminOverview() {
    const container = document.getElementById('adminOverview');
    if (!container) return;
    const users = getAllUsers();
    const feedbacks = getAllFeedbacks();
    const submissions = getAllTestSubmissions();

    // Header: only show users and feedback counts to admin-end
    let rightInfo = '';
    if (currentAdmin === 'admin-end') {
        rightInfo = `<strong>Users:</strong> ${users.length} &nbsp; <strong>Feedbacks:</strong> ${feedbacks.length} &nbsp; <strong>Submissions:</strong> ${submissions.length}`;
    } else if (currentAdmin === 'admin-natalia111') {
        // Natalia should only see submissions count (no users/feedbacks)
        rightInfo = `<strong>Submissions:</strong> ${submissions.length}`;
    } else {
        rightInfo = '';
    }
    let html = `<div style="display:flex; gap:1rem; align-items:center; justify-content:space-between;"><div><strong>Current Admin:</strong> ${currentAdmin || 'none'}</div><div style="text-align:right">${rightInfo}</div></div>`;

    if (currentAdmin === 'admin-end') {
        // detailed view for admin-end (users, feedbacks, submissions)
        html += '<div style="margin-top:1rem; display:grid; grid-template-columns:1fr 1fr; gap:1rem;">';
        // Users table for admin-end
        html += '<div style="background:#fff; padding:1rem; border-radius:12px; overflow:auto;">';
        html += '<h4>Users</h4>';
        if (users.length === 0) {
            html += '<p>No users yet.</p>';
        } else {
            html += '<table style="width:100%; border-collapse:collapse;">';
            html += '<thead><tr style="text-align:left; border-bottom:1px solid #e6e6e6;"><th style="padding:8px">ID</th><th style="padding:8px">Name</th><th style="padding:8px">Email</th><th style="padding:8px">Country</th><th style="padding:8px">Streak</th><th style="padding:8px">Actions</th></tr></thead>';
            html += '<tbody>';
            users.forEach(u => {
                const uid = escapeHtml(String(u.id));
                const name = escapeHtml((u.firstName || '') + ' ' + (u.lastName || ''));
                const email = escapeHtml(u.email || '');
                const country = escapeHtml(u.country || '');
                const streak = escapeHtml(String(u.streak || 0));
                html += `<tr style="border-bottom:1px solid #f4f4f4;"><td style="padding:8px; vertical-align:top;">${uid}</td><td style="padding:8px; vertical-align:top;">${name}</td><td style="padding:8px; vertical-align:top;">${email}</td><td style="padding:8px; vertical-align:top;">${country}</td><td style="padding:8px; vertical-align:top;">${streak}</td><td style="padding:8px; vertical-align:top;"><button class="btn btn-sm" onclick="openEditUserModal('${uid}')">Edit</button> <button class="btn btn-danger btn-sm" onclick="deleteUser('${uid}')">Delete</button></td></tr>`;
            });
            html += '</tbody></table>';
        }
        html += '</div>';

        // Feedbacks & submissions
        html += '<div style="background:#fff; padding:1rem; border-radius:12px;\"><h4>Feedbacks</h4>';
        if (feedbacks.length === 0) html += '<p>No feedbacks yet.</p>'; else {
            feedbacks.slice().reverse().forEach(f => {
                html += `<div style="border-bottom:1px solid #eee; padding:0.5rem 0;\"><strong>${f.name}</strong> <small style="color:var(--gray)">${new Date(f.createdAt).toLocaleString()}</small><div style="margin-top:0.5rem">${f.message}</div></div>`;
            });
        }
        html += '<h4 style="margin-top:1rem">Test Submissions</h4>';
        if (submissions.length === 0) html += '<p>No submissions yet.</p>'; else {
            submissions.slice().reverse().forEach(s => {
                html += `<div style="border-bottom:1px solid #eee; padding:0.5rem 0;\"><strong>${s.name}</strong> <small style="color:var(--gray)">${s.level} • ${new Date(s.submittedAt).toLocaleString()}</small><div style="margin-top:0.5rem; font-size:0.9rem; color:var(--dark)">Answers: ${Object.keys(s.answers).length}</div></div>`;
            });
        }
        html += '</div>';
        html += '</div>';
    } else if (currentAdmin === 'admin-natalia111') {
        // Natalia admin - show submissions + content management
        html += '<div style="margin-top:1rem;">';
        html += '<div style="background:#fff; padding:1rem; border-radius:12px;\"><h4>Test Submissions</h4>';
        if (submissions.length === 0) {
            html += '<p>No submissions yet.</p>';
        } else {
            submissions.slice().reverse().forEach(s => {
                html += `<div style="border-bottom:1px solid #eee; padding:0.5rem 0;"><strong>${escapeHtml(s.name)}</strong> <small style="color:var(--gray)">${escapeHtml(s.level)} • ${new Date(s.submittedAt).toLocaleString()}</small>`;
                // Show each answer
                if (s.answers && Object.keys(s.answers).length > 0) {
                    html += '<div style="margin-top:0.5rem; font-size:0.95rem; color:var(--dark); padding-left:0.5rem;">';
                    Object.keys(s.answers).forEach(k => {
                        const ans = s.answers[k];
                        html += `<div style="margin-bottom:0.4rem;"><strong>Q${Number(k)+1}:</strong> ${escapeHtml(String(ans))}</div>`;
                    });
                    html += '</div>';
                } else {
                    html += '<div style="margin-top:0.5rem; font-size:0.9rem; color:var(--dark)">No answers provided.</div>';
                }
                // add review button for Natalia and delete button
                html += `<div style="margin-top:0.5rem; text-align:right;"><button class="btn btn-sm" onclick="openReviewModal(${s.id})">Review & Send</button> <button class="btn btn-danger btn-sm" onclick="deleteSubmission(${s.id})">Delete</button></div>`;
                html += '</div>';
            });
        }
        html += '</div></div>';
    } else {
        html += '<div style="margin-top:1rem">Open admin using admin key.</div>';
    }

    container.innerHTML = html;
}

// Admin Functions
function loadAdminContent(level) {
    const content = getAllContent()[level];
    const container = document.getElementById('adminContentList');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading content...</p></div>';

    setTimeout(() => {
        let html = '';

        // Lessons
        html += '<h3>Lessons</h3>';
        content.lessons.forEach(item => {
            html += createContentItem(item, level, 'lessons');
        });

        // Vocabulary
        html += '<h3>Vocabulary</h3>';
        content.vocabulary.forEach(item => {
            html += createContentItem(item, level, 'vocabulary');
        });

        // Quiz
        html += '<h3>Quiz Questions</h3>';
        content.quiz.forEach(item => {
            html += createContentItem(item, level, 'quiz');
        });

        // Test
        html += '<h3>Test Questions</h3>';
        content.test.forEach(item => {
            html += createContentItem(item, level, 'test');
        });

        // Stories
        html += '<h3>Stories</h3>';
        content.stories.forEach(item => {
            html += createContentItem(item, level, 'stories');
        });

        if (!html) {
            html = '<p>No content available for this level yet.</p>';
        }

        container.innerHTML = `<div class="content-list">${html}</div>`;
    }, 500);
}

function createContentItem(item, level, type) {
    const title = item.title || item.word || item.question || 'Untitled';
    return `
        <div class="content-item">
            <div>
                <strong>${title}</strong>
                <small style="color: var(--gray); margin-left: 10px;">(${type})</small>
            </div>
            <div class="content-actions">
                <button class="btn btn-warning btn-sm" onclick="editContent('${level}', '${type}', ${item.id})">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteContent('${level}', '${type}', ${item.id})">Delete</button>
            </div>
        </div>
    `;
}

window.deleteContent = function(level, type, id) {
    if (!confirm('Are you sure you want to delete this content?')) return;

    const allContent = getAllContent();
    allContent[level][type] = allContent[level][type].filter(item => item.id !== id);
    saveAllContent(allContent);

    loadAdminContent(level);
    if (currentLevel === level) {
        loadLevelContent(level);
    }
};

window.editContent = function(level, type, id) {
    openEditContentModal(level, type, id);
};

// Open edit content modal and populate fields according to type
function openEditContentModal(level, type, id) {
    const content = getAllContent();
    const item = (content[level] && content[level][type]) ? content[level][type].find(i => i.id === id) : null;
    if (!item) return alert('Content not found.');

    document.getElementById('editContentLevel').value = level;
    document.getElementById('editContentType').value = type;
    document.getElementById('editContentId').value = id;

    const container = document.getElementById('editContentFields');
    container.innerHTML = '';

    // build fields depending on type
    if (type === 'lessons') {
        container.innerHTML = `
            <div class="form-group"><label>Title</label><input id="editLessonTitle" class="form-control" value="${escapeHtml(item.title||'')}" required></div>
            <div class="form-group"><label>Content</label><textarea id="editLessonContent" class="form-control" rows="6" required>${escapeHtml(item.content||'')}</textarea></div>
            <div class="form-group"><label>Media URL (optional)</label><input id="editLessonMediaUrl" class="form-control" value="${item.media?escapeHtml(item.media.url):''}"></div>
        `;
    } else if (type === 'vocabulary') {
        container.innerHTML = `
            <div class="form-group"><label>Word</label><input id="editVocabWord" class="form-control" value="${escapeHtml(item.word||'')}" required></div>
            <div class="form-group"><label>Translation</label><input id="editVocabTranslation" class="form-control" value="${escapeHtml(item.translation||'')}"></div>
            <div class="form-group"><label>Pronunciation</label><input id="editVocabPronunciation" class="form-control" value="${escapeHtml(item.pronunciation||'')}"></div>
            <div class="form-group"><label>Example</label><input id="editVocabExample" class="form-control" value="${escapeHtml(item.example||'')}"></div>
            <div class="form-group"><label>Image URL</label><input id="editVocabMediaUrl" class="form-control" value="${item.media?escapeHtml(item.media.url):''}"></div>
        `;
    } else if (type === 'quiz') {
        // show question and options
        const opts = (item.options || []).map((o,i)=> `<div class="form-group"><label>Option ${i+1}</label><input class="form-control quizOption" data-index="${i}" value="${escapeHtml(o)}"></div>`).join('');
        container.innerHTML = `
            <div class="form-group"><label>Question</label><input id="editQuizQuestion" class="form-control" value="${escapeHtml(item.question||'')}" required></div>
            ${opts}
            <div class="form-group"><label>Correct Option Index (0-3)</label><input id="editQuizAnswer" class="form-control" value="${item.answer}"></div>
        `;
    } else if (type === 'test') {
        container.innerHTML = `
            <div class="form-group"><label>Question</label><textarea id="editTestQuestion" class="form-control" rows="4" required>${escapeHtml(item.question||'')}</textarea></div>
        `;
    } else if (type === 'stories') {
        container.innerHTML = `
            <div class="form-group"><label>Title</label><input id="editStoryTitle" class="form-control" value="${escapeHtml(item.title||'')}" required></div>
            <div class="form-group"><label>Content</label><textarea id="editStoryContent" class="form-control" rows="6" required>${escapeHtml(item.content||'')}</textarea></div>
            <div class="form-group"><label>Media URL</label><input id="editStoryMediaUrl" class="form-control" value="${item.media?escapeHtml(item.media.url):''}"></div>
        `;
    } else {
        return alert('Unsupported content type for edit');
    }

    document.getElementById('editContentModal').classList.remove('hidden');
}

// Save edited content
document.addEventListener('DOMContentLoaded', function() {
    const editContentForm = document.getElementById('editContentForm');
    if (editContentForm) {
        editContentForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const level = document.getElementById('editContentLevel').value;
            const typeKey = document.getElementById('editContentType').value;
            const id = Number(document.getElementById('editContentId').value);
            const allContent = getAllContent();
            const typeArr = allContent[level] && allContent[level][typeKey];
            if (!typeArr) return alert('Content bucket not found');
            const idx = typeArr.findIndex(i=>i.id===id);
            if (idx === -1) return alert('Item not found');
            const item = typeArr[idx];

            // apply changes depending on typeKey
            if (typeKey === 'lessons') {
                item.title = document.getElementById('editLessonTitle').value;
                item.content = document.getElementById('editLessonContent').value;
                const url = document.getElementById('editLessonMediaUrl').value.trim();
                item.media = url ? { type: 'image', url } : null;
            } else if (typeKey === 'vocabulary') {
                item.word = document.getElementById('editVocabWord').value;
                item.translation = document.getElementById('editVocabTranslation').value;
                item.pronunciation = document.getElementById('editVocabPronunciation').value;
                item.example = document.getElementById('editVocabExample').value;
                const url = document.getElementById('editVocabMediaUrl').value.trim();
                item.media = url ? { type: 'image', url } : null;
            } else if (typeKey === 'quiz') {
                item.question = document.getElementById('editQuizQuestion').value;
                const opts = [];
                document.querySelectorAll('.quizOption').forEach(i => opts.push(i.value));
                item.options = opts;
                item.answer = Number(document.getElementById('editQuizAnswer').value) || 0;
            } else if (typeKey === 'test') {
                item.question = document.getElementById('editTestQuestion').value;
            } else if (typeKey === 'stories') {
                item.title = document.getElementById('editStoryTitle').value;
                item.content = document.getElementById('editStoryContent').value;
                const url = document.getElementById('editStoryMediaUrl').value.trim();
                item.media = url ? { type: 'image', url } : null;
            }

            // save and refresh
            saveAllContent(allContent);
            document.getElementById('editContentModal').classList.add('hidden');
            showAdminNotification('Content updated');
            if (currentLevel === level) loadLevelContent(level);
            const adminSelect = document.getElementById('adminLevelSelect');
            if (adminSelect && adminSelect.value === level) loadAdminContent(level);
        });

        document.getElementById('cancelEditContent').addEventListener('click', function() {
            document.getElementById('editContentModal').classList.add('hidden');
        });
    }

    // Edit user handlers
    const editUserForm = document.getElementById('editUserForm');
    if (editUserForm) {
        editUserForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const id = document.getElementById('editUserId').value;
            const users = getAllUsers();
            const idx = users.findIndex(u => String(u.id) === String(id));
            if (idx === -1) return alert('User not found');
            const u = users[idx];
            u.firstName = document.getElementById('editUserFirstName').value;
            u.lastName = document.getElementById('editUserLastName').value;
            // If the email or country inputs are readonly (user editing their own profile), preserve existing values
            const countryInput = document.getElementById('editUserCountry');
            const emailInput = document.getElementById('editUserEmail');
            if (countryInput && countryInput.hasAttribute('readonly')) {
                // keep existing
            } else {
                u.country = countryInput ? countryInput.value : u.country;
            }
            if (emailInput && emailInput.hasAttribute('readonly')) {
                // keep existing
            } else {
                u.email = emailInput ? String(emailInput.value).toLowerCase() : u.email;
            }
            users[idx] = u;
            saveAllUsers(users);
            // update firebase profile if uid-like
            if (firebaseEnabled && firebase.database) {
                const uid = String(u.id);
                firebase.database().ref(`/users/${uid}`).set(Object.assign({}, u)).catch(()=>{});
            }
            document.getElementById('editUserModal').classList.add('hidden');
            showAdminNotification('User updated');
            renderAdminOverview();
        });

        document.getElementById('cancelEditUser').addEventListener('click', function() {
            document.getElementById('editUserModal').classList.add('hidden');
        });
    }
});

function escapeHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Open user edit modal
function openEditUserModal(userId) {
    const users = getAllUsers();
    const user = users.find(u => String(u.id) === String(userId));
    if (!user) return alert('User not found');
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUserFirstName').value = user.firstName || '';
    document.getElementById('editUserLastName').value = user.lastName || '';
    document.getElementById('editUserCountry').value = user.country || '';
    document.getElementById('editUserEmail').value = user.email || '';
    // If the current viewer is NOT an admin and is editing their own profile,
    // prevent changing email and country
    const signed = getSignedInUser();
    const countryInput = document.getElementById('editUserCountry');
    const emailInput = document.getElementById('editUserEmail');
    if (!currentAdmin && signed && String(signed.id) === String(user.id)) {
        if (countryInput) { countryInput.setAttribute('readonly', 'readonly'); countryInput.style.background = '#f5f5f5'; }
        if (emailInput) { emailInput.setAttribute('readonly', 'readonly'); emailInput.style.background = '#f5f5f5'; }
    } else {
        if (countryInput) { countryInput.removeAttribute('readonly'); countryInput.style.background = ''; }
        if (emailInput) { emailInput.removeAttribute('readonly'); emailInput.style.background = ''; }
    }
    document.getElementById('editUserModal').classList.remove('hidden');
}

function deleteUser(userId) {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    let users = getAllUsers();
    users = users.filter(u => String(u.id) !== String(userId));
    saveAllUsers(users);
    // delete from firebase if looks like uid
    if (firebaseEnabled && firebase.database) {
        const uid = String(userId);
        firebase.database().ref(`/users/${uid}`).remove().catch(()=>{});
    }
    showAdminNotification('User deleted');
    renderAdminOverview();
}

function generateDynamicFields(contentType) {
    const container = document.getElementById('dynamicFields');
    container.innerHTML = '';

    let fields = '';

    switch (contentType) {
        case 'lesson':
            fields = `
                <div class="form-group">
                    <label for="lessonTitle">Lesson Title</label>
                    <input type="text" id="lessonTitle" class="form-control" required>
                </div>
                <div class="form-group">
                    <label for="lessonContent">Lesson Content</label>
                    <textarea id="lessonContent" class="form-control" rows="5" required></textarea>
                </div>
                <div class="form-group">
                    <label for="lessonMediaType">Media Type (Optional)</label>
                    <select id="lessonMediaType" class="form-control">
                        <option value="">None</option>
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                        <option value="audio">Audio</option>
                    </select>
                </div>
                <div class="form-group" id="lessonMediaUrlGroup" style="display:none;">
                    <label for="lessonMediaUrl">Media URL</label>
                    <input type="url" id="lessonMediaUrl" class="form-control" placeholder="https://example.com/media.jpg">
                </div>
            `;
            break;

        case 'vocabulary':
            fields = `
                <div class="form-group">
                    <label for="vocabWord">Word</label>
                    <input type="text" id="vocabWord" class="form-control" required>
                </div>
                <div class="form-group">
                    <label for="vocabTranslation">Translation (Optional)</label>
                    <input type="text" id="vocabTranslation" class="form-control">
                </div>
                <div class="form-group">
                    <label for="vocabPronunciation">Pronunciation (Optional)</label>
                    <input type="text" id="vocabPronunciation" class="form-control" placeholder="/həˈloʊ/">
                </div>
                <div class="form-group">
                    <label for="vocabExample">Example Sentence (Optional)</label>
                    <input type="text" id="vocabExample" class="form-control">
                </div>
                <div class="form-group">
                    <label for="vocabMediaType">Media Type (Optional)</label>
                    <select id="vocabMediaType" class="form-control">
                        <option value="">None</option>
                        <option value="image">Image</option>
                    </select>
                </div>
                <div class="form-group" id="vocabMediaUrlGroup" style="display:none;">
                    <label for="vocabMediaUrl">Image URL</label>
                    <input type="url" id="vocabMediaUrl" class="form-control">
                </div>
            `;
            break;

        case 'quiz':
            fields = `
                <div class="form-group">
                    <label for="quizQuestion">Question</label>
                    <input type="text" id="quizQuestion" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Options (Correct answer will be the one with * at the end)</label>
                    <div id="quizOptions">
                        <input type="text" class="form-control" placeholder="Option 1*" style="margin-bottom: 0.5rem;">
                        <input type="text" class="form-control" placeholder="Option 2" style="margin-bottom: 0.5rem;">
                        <input type="text" class="form-control" placeholder="Option 3" style="margin-bottom: 0.5rem;">
                        <input type="text" class="form-control" placeholder="Option 4">
                    </div>
                </div>
            `;
            break;

        case 'test':
            fields = `
                <div class="form-group">
                    <label for="testQuestion">Question</label>
                    <textarea id="testQuestion" class="form-control" rows="3" required></textarea>
                </div>
            `;
            break;

        case 'story':
            fields = `
                <div class="form-group">
                    <label for="storyTitle">Story Title</label>
                    <input type="text" id="storyTitle" class="form-control" required>
                </div>
                <div class="form-group">
                    <label for="storyContent">Story Content</label>
                    <textarea id="storyContent" class="form-control" rows="8" required></textarea>
                </div>
                <div class="form-group">
                    <label for="storyMediaType">Media Type (Optional)</label>
                    <select id="storyMediaType" class="form-control">
                        <option value="">None</option>
                        <option value="image">Image</option>
                        <option value="audio">Audio</option>
                    </select>
                </div>
                <div class="form-group" id="storyMediaUrlGroup" style="display:none;">
                    <label for="storyMediaUrl">Media URL</label>
                    <input type="url" id="storyMediaUrl" class="form-control">
                </div>
            `;
            break;
    }

    container.innerHTML = fields;

    // Add event listeners for media type changes
    const mediaSelect = container.querySelector('[id$="MediaType"]');
    if (mediaSelect) {
        mediaSelect.addEventListener('change', function() {
            const urlGroup = container.querySelector(`#${this.id.replace('Type', 'UrlGroup')}`);
            if (urlGroup) {
                urlGroup.style.display = this.value ? 'block' : 'none';
            }
        });
    }
}

function addNewContent() {
    const level = document.getElementById('contentLevel').value;
    const type = document.getElementById('contentType').value;
    if (!level || !type) return;

    const allContent = getAllContent();
    const levelData = allContent[level];
    let newItem = { id: Date.now() };

    switch (type) {
        case 'lesson':
            newItem.title = document.getElementById('lessonTitle').value;
            newItem.content = document.getElementById('lessonContent').value;
            const lessonMediaType = document.getElementById('lessonMediaType').value;
            const lessonMediaUrl = document.getElementById('lessonMediaUrl').value;
            if (lessonMediaType && lessonMediaUrl) {
                newItem.media = { type: lessonMediaType, url: lessonMediaUrl };
            }
            break;

        case 'vocabulary':
            newItem.word = document.getElementById('vocabWord').value;
            newItem.translation = document.getElementById('vocabTranslation').value;
            newItem.pronunciation = document.getElementById('vocabPronunciation').value;
            newItem.example = document.getElementById('vocabExample').value;
            const vocabMediaType = document.getElementById('vocabMediaType').value;
            const vocabMediaUrl = document.getElementById('vocabMediaUrl').value;
            if (vocabMediaType && vocabMediaUrl) {
                newItem.media = { type: vocabMediaType, url: vocabMediaUrl };
            }
            break;

        case 'quiz':
            newItem.question = document.getElementById('quizQuestion').value;
            newItem.options = [];
            let correctIndex = -1;
            document.querySelectorAll('#quizOptions input').forEach((input, index) => {
                let text = input.value.trim();
                if (text) {
                    if (text.endsWith('*')) {
                        correctIndex = newItem.options.length;
                        text = text.slice(0, -1).trim();
                    }
                    newItem.options.push(text);
                }
            });
            if (correctIndex !== -1) {
                newItem.answer = correctIndex;
            } else {
                alert('Please mark the correct option with * at the end.');
                return;
            }
            break;

        case 'test':
            newItem.question = document.getElementById('testQuestion').value;
            break;

        case 'story':
            newItem.title = document.getElementById('storyTitle').value;
            newItem.content = document.getElementById('storyContent').value;
            const storyMediaType = document.getElementById('storyMediaType').value;
            const storyMediaUrl = document.getElementById('storyMediaUrl').value;
            if (storyMediaType && storyMediaUrl) {
                newItem.media = { type: storyMediaType, url: storyMediaUrl };
            }
            break;
    }

    // map admin form 'type' to the actual content key in storage
    const keyMap = {
        lesson: 'lessons',
        vocabulary: 'vocabulary',
        quiz: 'quiz',
        test: 'test',
        story: 'stories'
    };
    const arrKey = keyMap[type];
    if (!arrKey) {
        alert('Unknown content type. Content not saved.');
        return;
    }
    levelData[arrKey] = levelData[arrKey] || [];
    levelData[arrKey].push(newItem);
    saveAllContent(allContent);

    // Reset form
    document.getElementById('addContentForm').reset();
    generateDynamicFields('');

    // Notify admin visually
    try { showAdminNotification('Content added successfully'); } catch(e) { alert('Content added successfully!'); }

    // Reload admin view if managing this level
    const adminSelect = document.getElementById('adminLevelSelect');
    if (adminSelect && adminSelect.value === level) {
        loadAdminContent(level);
    }
    // If users are currently viewing this level, update their view immediately
    if (currentLevel === level) {
        loadLevelContent(level);
    }
}

// Small helper to show transient admin notifications inside the admin panel
function showAdminNotification(message, timeout = 3000) {
    const panel = document.getElementById('adminPanel');
    if (!panel) return alert(message);
    let note = document.getElementById('adminNotification');
    if (!note) {
        note = document.createElement('div');
        note.id = 'adminNotification';
        note.style.position = 'fixed';
        note.style.right = '20px';
        note.style.top = '80px';
        note.style.background = '#1e7e34';
        note.style.color = 'white';
        note.style.padding = '12px 16px';
        note.style.borderRadius = '8px';
        note.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
        note.style.zIndex = 9999;
        note.style.fontSize = '14px';
        panel.appendChild(note);
    }
    note.textContent = message;
    note.style.opacity = '1';
    if (note._timeout) clearTimeout(note._timeout);
    note._timeout = setTimeout(() => {
        try { note.style.opacity = '0'; panel.removeChild(note); } catch(e){}
    }, timeout);
}