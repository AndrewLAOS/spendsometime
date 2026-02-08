/**
 * SpendSomeTime Gamification System
 * Manages XP tracking, theme unlocking, streaks, achievements, and rewards
 */

const GameSystem = {
  // Default user data structure
  defaultUserData: {
    totalXP: 0,
    unlockedThemes: ['default'],
    activeTheme: 'default',
    xpHistory: [],
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null,
    unlockedAchievements: [], // Array of achievement IDs
    achievementUnlockTimes: {}, // Track when achievements were unlocked to prevent re-triggering
milestones: [50, 100, 250, 500, 1000, 2500, 5000],
passedMilestones: []

  },

  // Reward amounts for different actions (SINGLE SOURCE OF TRUTH)
  rewards: {
    logOfflineSession: 10,
    completeChallenge: 25,
    logReflection: 5,
    completeQuiz: 15,
    winGame: 20,
    themeUnlock: 10,
  },

  // Achievement definitions
  achievements: {
    firstSteps: { id: 'firstSteps', name: '🚀 First Steps', desc: 'Earn your first XP', xp: 10 },
    earlyBird: { id: 'earlyBird', name: '🌅 Early Bird', desc: 'Earn 50 XP', xp: 50 },
    grinder: { id: 'grinder', name: '⚡ Grinder', desc: 'Earn 250 XP', xp: 250 },
    legend: { id: 'legend', name: '👑 Legend', desc: 'Earn 1000 XP', xp: 1000 },
    streakStarter: { id: 'streakStarter', name: '🔥 Streak Starter', desc: 'Build a 3-day streak', streak: 3 },
    collectorFirst: { id: 'collectorFirst', name: '🎨 Collector', desc: 'Unlock your first theme', theme: 1 },
    collectorMaster: { id: 'collectorMaster', name: '🌈 Master Collector', desc: 'Unlock 5 themes', theme: 5 },
  },

  // Debouncing: prevent XP farming from rapid refreshes/navigation
  _lastXPAwardTime: 0,
  _xpDebounceMs: 500, // Minimum ms between XP awards for same action

  /**
   * Initialize gamification system
   * @returns {Object} User gamification data
   */
  init() {
    let userData = this.getUserData();
    if (!userData) {
      userData = { ...this.defaultUserData };
      this.saveUserData(userData);
    }
    // Initialize achievement timestamps if missing (migration)
    if (!userData.achievementUnlockTimes) {
      userData.achievementUnlockTimes = {};
    }
    // Dispatch event to notify that GameSystem is ready
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('gamificationReady', { detail: userData }));
      window.dispatchEvent(new CustomEvent('gamificationUpdate', { detail: userData }));
    }, 0);
    return userData;
  },

  /**
   * Get user's gamification data from localStorage
   * @returns {Object|null} User data or null if not found
   */
  getUserData() {
    const data = localStorage.getItem('gamificationData');
    return data ? JSON.parse(data) : null;
  },

  /**
   * Save user's gamification data to localStorage (SINGLE SOURCE OF TRUTH)
   * @param {Object} userData - User data to save
   */
  saveUserData(userData) {
    localStorage.setItem('gamificationData', JSON.stringify(userData));
    // Trigger custom event so UI can update
    window.dispatchEvent(new CustomEvent('gamificationUpdate', { detail: userData }));
  },

  /**
   * Award XP to user with debouncing to prevent farming
   * @param {number} amount - XP to award
   * @param {string} source - Source of XP (for analytics)
   * @returns {Object} Updated user data or null if debounced
   */
  awardXP(amount, source = 'unknown') {
    const now = Date.now();
    // FARMING PREVENTION: Check if we're awarding too frequently
    if (now - this._lastXPAwardTime < this._xpDebounceMs) {
      console.log('XP award debounced - too frequent');
      return null; // Debounced, don't award
    }
    this._lastXPAwardTime = now;

    const userData = this.getUserData() || this.defaultUserData;
    userData.totalXP += amount;

    // Track XP history for analytics
    userData.xpHistory.push({
      amount,
      source,
      timestamp: new Date().toISOString()
    });

    // Update streak
    this.updateStreak(userData);

    // Check for NEWLY unlocked achievements (only)
    const newAchievements = this.checkAchievements(userData);

    this.saveUserData(userData);
    
    // SEPARATE VISUAL FEEDBACK FROM STATE: Dispatch event with new achievements
    // Only achievements unlocked in THIS call are included
    window.dispatchEvent(new CustomEvent('xpGained', { 
      detail: { 
        amount, 
        source, 
        newTotal: userData.totalXP,
        streakMultiplier: this.getStreakMultiplier(userData),
        newAchievements  // Only newly unlocked ones
      } 
    }));

    // Check for milestones
    this.checkMilestone(userData);

    return userData;
  },

  /**
   * Update user's daily streak (IDEMPOTENT: safe to call multiple times)
   * @param {Object} userData - User data to update
   */
  updateStreak(userData) {
    const today = new Date().toDateString();
    const lastDate = userData.lastActivityDate ? new Date(userData.lastActivityDate).toDateString() : null;
    
    // Only update if date changed (prevent multiple updates same day)
    if (lastDate !== today) {
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      
      if (lastDate === yesterday) {
        userData.currentStreak += 1;
      } else {
        userData.currentStreak = 1;
      }
      
      if (userData.currentStreak > userData.longestStreak) {
        userData.longestStreak = userData.currentStreak;
      }
      
      userData.lastActivityDate = new Date().toISOString();
    }
  },

  /**
   * Get streak-based XP multiplier (1.0 base, up to 1.5x at 7+ day streaks)
   * @param {Object} userData - User data
   * @returns {number} Multiplier (1.0 - 1.5)
   */
  getStreakMultiplier(userData) {
    const streak = userData.currentStreak || 0;
    if (streak >= 7) return 1.5;
    if (streak >= 5) return 1.3;
    if (streak >= 3) return 1.1;
    return 1.0;
  },

  /**
   * Check for achievement unlocks - only returns NEWLY unlocked achievements
   * CRITICAL: Each achievement is shown only once per unlock
   * @param {Object} userData - User data
   * @returns {Array} Newly unlocked achievements (empty if none new)
   */
  checkAchievements(userData) {
    const newAchievements = [];
    userData.unlockedAchievements = userData.unlockedAchievements || [];
    userData.achievementUnlockTimes = userData.achievementUnlockTimes || {};

    Object.values(this.achievements).forEach(achievement => {
      // GUARD: Skip if already unlocked
      if (userData.unlockedAchievements.includes(achievement.id)) {
        return;
      }

      let unlocked = false;

      if (achievement.xp && userData.totalXP >= achievement.xp) {
        unlocked = true;
      } else if (achievement.streak && userData.currentStreak >= achievement.streak) {
        unlocked = true;
      } else if (achievement.theme && userData.unlockedThemes.length >= achievement.theme + 1) {
        unlocked = true;
      }

      if (unlocked) {
        userData.unlockedAchievements.push(achievement.id);
        // PERSISTENCE: Record the exact time achievement was unlocked
        userData.achievementUnlockTimes[achievement.id] = new Date().toISOString();
        newAchievements.push(achievement);
      }
    });

    return newAchievements;
  },

  /**
   * Check for XP milestones and celebrate
   * @param {Object} userData - User data
   */
  checkMilestone(userData) {
    userData.milestones = userData.milestones || [50, 100, 250, 500, 1000, 2500, 5000];
    userData.passedMilestones = userData.passedMilestones || [];
    
    userData.milestones.forEach(milestone => {
      // Only trigger once per milestone
      if (userData.totalXP >= milestone && !userData.passedMilestones.includes(milestone)) {
        userData.passedMilestones.push(milestone);
        
        window.dispatchEvent(new CustomEvent('milestoneCelebration', {
          detail: { milestone, totalXP: userData.totalXP }
        }));
      }
    });
  },

  /**
   * Check if user can afford a theme
   * @param {number} cost - XP cost of theme
   * @returns {boolean} True if user has enough XP
   */
  canAffordTheme(cost) {
    const userData = this.getUserData();
    return userData && userData.totalXP >= cost;
  },

  /**
   * Unlock a theme by spending XP
   * @param {string} themeId - Theme ID to unlock
   * @param {number} cost - XP cost
   * @returns {Object|null} Updated user data on success, null on failure
   */
  unlockTheme(themeId, cost) {
    const userData = this.getUserData() || this.defaultUserData;

    // Validate theme not already unlocked
    if (userData.unlockedThemes.includes(themeId)) {
      return null; // Already unlocked
    }

    // Validate user has enough XP
    if (userData.totalXP < cost) {
      return null; // Not enough XP
    }

    // Deduct XP and unlock theme
    userData.totalXP -= cost;
    userData.unlockedThemes.push(themeId);

    // Check for achievements
    const newAchievements = this.checkAchievements(userData);

    this.saveUserData(userData);

    // Dispatch event for celebration/notification
    window.dispatchEvent(new CustomEvent('themeUnlocked', { 
      detail: { themeId, remainingXP: userData.totalXP, newAchievements } 
    }));

    return userData;
  },

  /**
   * Check if a theme is unlocked
   * @param {string} themeId - Theme ID to check
   * @returns {boolean} True if unlocked
   */
  isThemeUnlocked(themeId) {
    const userData = this.getUserData();
    return userData && userData.unlockedThemes.includes(themeId);
  },

  /**
   * Set active theme (must be unlocked)
   * @param {string} themeId - Theme ID to activate
   * @returns {boolean} True on success
   */
  setActiveTheme(themeId) {
    if (!this.isThemeUnlocked(themeId)) {
      return false;
    }

    const userData = this.getUserData();
    userData.activeTheme = themeId;
    this.saveUserData(userData);

    // Dispatch event to apply theme
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { themeId } }));

    return true;
  },

  /**
   * Get active theme ID
   * @returns {string} Active theme ID
   */
  getActiveTheme() {
    const userData = this.getUserData();
    return userData ? userData.activeTheme : 'default';
  },

  /**
   * Get list of unlocked theme IDs
   * @returns {Array} Array of theme IDs
   */
  getUnlockedThemes() {
    const userData = this.getUserData();
    return userData ? userData.unlockedThemes : ['default'];
  },

  /**
   * Get current XP total
   * @returns {number} Total XP
   */
  getTotalXP() {
    const userData = this.getUserData();
    return userData ? userData.totalXP : 0;
  },

  /**
   * Reset gamification data (for testing or user request)
   */
  reset() {
    localStorage.removeItem('gamificationData');
    this.init();
  },

  /**
   * Get current streak info
   * @returns {Object} Streak data
   */
  getStreakInfo() {
    const userData = this.getUserData();
    return {
      current: userData?.currentStreak || 0,
      longest: userData?.longestStreak || 0,
      multiplier: this.getStreakMultiplier(userData)
    };
  },

  /**
   * Get all unlocked achievements
   * @returns {Array} Achievement objects
   */
  getAchievements() {
    const userData = this.getUserData();
    const unlockedIds = userData?.unlockedAchievements || [];
    return unlockedIds
      .map(id => Object.values(this.achievements).find(a => a.id === id))
      .filter(Boolean);
  },

  /**
   * Get next achievement to unlock
   * @returns {Object|null} Next achievement or null if all unlocked
   */
  getNextAchievement() {
    const userData = this.getUserData();
    const unlockedIds = userData?.unlockedAchievements || [];

    // Find first locked achievement
    for (const achievement of Object.values(this.achievements)) {
      if (!unlockedIds.includes(achievement.id)) {
        return achievement;
      }
    }
    return null;
  },

  // Level System - CENTRALIZED
  levels: [
    { xp: 0, name: 'Beginner', desc: 'You\'re just getting started!' },
    { xp: 100, name: 'Learner', desc: 'You\'re building momentum!' },
    { xp: 250, name: 'Scholar', desc: 'Knowledge is power!' },
    { xp: 500, name: 'Master', desc: 'You\'re becoming an expert!' },
    { xp: 1000, name: 'Sage', desc: 'True mastery has been achieved!' },
    { xp: 2500, name: 'Legend', desc: 'You are a legend!' },
    { xp: 5000, name: 'Mythical', desc: 'Beyond legendary!' }
  ],

  /**
   * Get current level based on XP
   * @param {number} xp - XP amount (optional, uses current if not provided)
   * @returns {Object} Level object with index, xp, name, desc
   */
  getCurrentLevel(xp = null) {
    const totalXP = xp !== null ? xp : this.getTotalXP();
    for (let i = this.levels.length - 1; i >= 0; i--) {
      if (totalXP >= this.levels[i].xp) {
        return { index: i, ...this.levels[i] };
      }
    }
    return { index: 0, ...this.levels[0] };
  },

  /**
   * Get next level
   * @returns {Object} Next level object
   */
  getNextLevel() {
    const currentLevel = this.getCurrentLevel();
    if (currentLevel.index < this.levels.length - 1) {
      return this.levels[currentLevel.index + 1];
    }
    return currentLevel;
  }

};

/**
 * Theme Manager - Loads themes from JSON and applies them
 * IDEMPOTENT: Safe to call applyTheme multiple times without re-rendering
 */
const ThemeManager = {
  themes: [],
  _currentAppliedTheme: null, // Track currently applied theme to prevent redundant applications

  /**
   * Load themes from themes.json
   */
  async loadThemes() {
    try {
      const response = await fetch('themes.json');
      this.themes = await response.json();
      this.applyActiveTheme();
      return this.themes;
    } catch (error) {
      console.error('Failed to load themes:', error);
      return [];
    }
  },

  /**
   * Get theme by ID
   * @param {string} themeId - Theme ID
   * @returns {Object|null} Theme object or null
   */
  getTheme(themeId) {
    return this.themes.find(t => t.id === themeId) || null;
  },

  /**
   * Get all themes
   * @returns {Array} Array of theme objects
   */
  getAllThemes() {
    return this.themes;
  },

  /**
   * Apply theme to document (IDEMPOTENT: Safe to call repeatedly)
   * GUARD: Skips if same theme is already applied
   * @param {string} themeId - Theme ID to apply
   */
  applyTheme(themeId) {
    const theme = this.getTheme(themeId);
    if (!theme) return;

    // GUARD: Skip if this theme is already applied (prevent redundant DOM updates)
    if (this._currentAppliedTheme === themeId) {
      return;
    }

    const root = document.documentElement;

    // Apply CSS variables
    Object.entries(theme.cssVariables || {}).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });

    // Apply background
    if (theme.background) {
      document.body.style.background = theme.background;
    }

    // Remove old theme class
    if (this._currentAppliedTheme) {
      document.body.classList.remove(`theme-${this._currentAppliedTheme}`);
    }
    
    // Add new theme class
    document.body.classList.add(`theme-${themeId}`);

    // Track what we applied (prevents re-application)
    this._currentAppliedTheme = themeId;

    // Save active theme (update GameSystem state)
    GameSystem.setActiveTheme(themeId);
  },

  /**
   * Apply the user's currently active theme (IDEMPOTENT)
   */
  applyActiveTheme() {
    const activeThemeId = GameSystem.getActiveTheme();
    this.applyTheme(activeThemeId);
  }
};

// Initialize on page load - enhanced to auto-apply theme
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    GameSystem.init();
    ThemeManager.loadThemes().then(() => {
      ThemeManager.applyActiveTheme();
    });
    initializeNavStats();
  });
} else {
  GameSystem.init();
  ThemeManager.loadThemes().then(() => {
    ThemeManager.applyActiveTheme();
  });
  initializeNavStats();
}

/**
 * Initialize navigation stats display and keep it updated
 * Updates nav XP/streak display across all pages
 */
function initializeNavStats() {
  function updateNavStats() {
    const navXpEl = document.getElementById('nav-xp');
    const navStreakEl = document.getElementById('nav-streak');
    const streakDaysEl = document.getElementById('streak-days');
    
    // GUARD: Only update if nav stats exist on this page
    if (!navXpEl) return; 
    
    const userData = GameSystem.getUserData();
    if (userData) {
      navXpEl.textContent = userData.totalXP;

      // Only update streak elements if they exist on the page
      if (navStreakEl && streakDaysEl) {
        if (userData.currentStreak > 0) {
          navStreakEl.style.display = 'inline';
          streakDaysEl.textContent = userData.currentStreak;
        } else {
          navStreakEl.style.display = 'none';
        }
      }
    }
  }
  
  // Update immediately
  updateNavStats();
  
  // Update on gamification events (DEBOUNCED by GameSystem.awardXP)
  window.addEventListener('gamificationUpdate', updateNavStats);
  window.addEventListener('xpGained', updateNavStats);
  window.addEventListener('gamificationReady', updateNavStats);
}

// Listen for progress events from other pages (e.g., challenges page)
// and award XP centrally. This avoids duplicating award logic on each page.
document.addEventListener('challengeProgress', (e) => {
  try {
    const d = e.detail || {};
    const timeSpent = Number(d.timeSpent) || 0; // minutes
    const progressIncreased = !!d.progressIncreased;
    const completed = !!d.completed;

    // Calculate XP: small reward per minutes, larger bonus for completing a challenge
    // Safe defaults to avoid large awards from bogus inputs
    const cappedMinutes = Math.min(Math.max(0, timeSpent), 300); // cap 300 minutes
    const xpFromTime = Math.round(cappedMinutes / 5); // 1 XP per ~5 minutes

    let xp = xpFromTime;
    if (progressIncreased) xp += 2; // small bonus for making daily progress
    if (completed) xp += GameSystem.rewards.completeChallenge || 25; // completion bonus

    // Apply streak multiplier
    const userData = GameSystem.getUserData() || {};
    const multiplier = GameSystem.getStreakMultiplier(userData) || 1.0;
    xp = Math.max(1, Math.round(xp * multiplier));

    // Award via centralized method (has internal debounce to reduce farming)
    GameSystem.awardXP(xp, 'challengeProgress');
  } catch (err) {
    console.warn('challengeProgress handler error', err);
  }
});

