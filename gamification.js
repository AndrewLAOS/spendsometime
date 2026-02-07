/**
 * SpendSomeTime Gamification System
 * Manages XP tracking, theme unlocking, streaks, achievements, and rewards
 */

const GameSystem = {
  // Default user data structure
  defaultUserData: {
    totalXP: 0,
    unlockedThemes: ['default'], // 'default' theme always unlocked
    activeTheme: 'default',
    xpHistory: [], // Track XP gains for analytics
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null,
    unlockedAchievements: [],
    milestones: [50, 100, 250, 500, 1000, 2500, 5000] // XP milestones for celebration
  },

  // Reward amounts for different actions
  rewards: {
    logOfflineSession: 10,    // Logging focus/offline time
    completeChallenge: 25,    // Completing a challenge
    logReflection: 5,         // Quick reflection or micro win
    completeQuiz: 15,         // Completing a skill quiz
    winGame: 20,              // Winning a brain game
    themeUnlock: 10,          // Bonus for successfully unlocking a theme
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
   * Save user's gamification data to localStorage
   * @param {Object} userData - User data to save
   */
  saveUserData(userData) {
    localStorage.setItem('gamificationData', JSON.stringify(userData));
    // Trigger custom event so UI can update
    window.dispatchEvent(new CustomEvent('gamificationUpdate', { detail: userData }));
  },

  /**
   * Award XP to user (never takes XP, only adds)
   * @param {number} amount - XP to award
   * @param {string} source - Source of XP (for analytics)
   * @returns {Object} Updated user data
   */
  awardXP(amount, source = 'unknown') {
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

    // Check for achievements
    const newAchievements = this.checkAchievements(userData);

    this.saveUserData(userData);
    
    // Dispatch event for UI animations
    window.dispatchEvent(new CustomEvent('xpGained', { 
      detail: { 
        amount, 
        source, 
        newTotal: userData.totalXP,
        streakMultiplier: this.getStreakMultiplier(userData),
        newAchievements 
      } 
    }));

    // Check for milestones
    this.checkMilestone(userData);

    return userData;
  },

  /**
   * Update user's daily streak
   * @param {Object} userData - User data to update
   */
  updateStreak(userData) {
    const today = new Date().toDateString();
    const lastDate = userData.lastActivityDate ? new Date(userData.lastActivityDate).toDateString() : null;
    
    if (lastDate !== today) {
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      
      if (lastDate === yesterday) {
        // Streak continues
        userData.currentStreak += 1;
      } else {
        // Streak broken or first activity
        userData.currentStreak = 1;
      }
      
      // Update longest streak
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
   * Check for achievement unlocks
   * @param {Object} userData - User data
   * @returns {Array} Newly unlocked achievements
   */
  checkAchievements(userData) {
    const newAchievements = [];
    userData.unlockedAchievements = userData.unlockedAchievements || [];

    Object.values(this.achievements).forEach(achievement => {
      if (userData.unlockedAchievements.includes(achievement.id)) return;

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
    
    userData.milestones.forEach(milestone => {
      if (userData.totalXP >= milestone && !userData.passedMilestones) {
        userData.passedMilestones = userData.passedMilestones || [];
      }
      if (userData.totalXP >= milestone && !userData.passedMilestones.includes(milestone)) {
        userData.passedMilestones = userData.passedMilestones || [];
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
  }

};

/**
 * Theme Manager - Loads themes from JSON and applies them
 */
const ThemeManager = {
  themes: [],

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
   * Apply theme to document
   * @param {string} themeId - Theme ID to apply
   */
  applyTheme(themeId) {
    const theme = this.getTheme(themeId);
    if (!theme) return;

    const root = document.documentElement;

    // Apply CSS variables
    Object.entries(theme.cssVariables || {}).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });

    // Apply background
    if (theme.background) {
      document.body.style.background = theme.background;
    }

    // Add theme class
    document.body.classList.remove(...this.themes.map(t => `theme-${t.id}`));
    document.body.classList.add(`theme-${themeId}`);

    // Save active theme
    GameSystem.setActiveTheme(themeId);
  },

  /**
   * Apply the user's currently active theme
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
 */
function initializeNavStats() {
  function updateNavStats() {
    const navXpEl = document.getElementById('nav-xp');
    const navStreakEl = document.getElementById('nav-streak');
    const streakDaysEl = document.getElementById('streak-days');
    
    if (!navXpEl) return; // Nav stats not on this page
    
    const userData = GameSystem.getUserData();
    if (userData) {
      navXpEl.textContent = userData.totalXP;
      
      if (userData.currentStreak > 0) {
        navStreakEl.style.display = 'inline';
        streakDaysEl.textContent = userData.currentStreak;
      }
    }
  }
  
  // Update immediately
  updateNavStats();
  
  // Update on gamification events
  window.addEventListener('gamificationUpdate', updateNavStats);
  window.addEventListener('xpGained', updateNavStats);
  window.addEventListener('gamificationReady', updateNavStats);
}

