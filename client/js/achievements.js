
/**
 * AchievementManager — standalone module that owns all achievement definitions,
 * unlock logic, and unlock-notification callbacks.
 *
 * To add a new achievement, just add an entry to DEFINITIONS below.
 * No other file needs to change.
 */
define(function() {

    // ── Achievement definitions ──────────────────────────────────────────
    // `isCompleted` is optional — if omitted the achievement is considered
    // complete as soon as tryUnlock is called (event-driven achievements).
    // `hidden` is optional — defaults to false.
    var DEFINITIONS = {
        A_TRUE_WARRIOR: {
            id: 1,
            name: "A True Warrior",
            desc: "Find a new weapon"
        },
        INTO_THE_WILD: {
            id: 2,
            name: "Into the Wild",
            desc: "Venture outside the village"
        },
        ANGRY_RATS: {
            id: 3,
            name: "Angry Rats",
            desc: "Kill 10 rats",
            isCompleted: function() {
                return AchievementManager.storage.getRatCount() >= 10;
            }
        },
        SMALL_TALK: {
            id: 4,
            name: "Small Talk",
            desc: "Talk to a non-player character"
        },
        FAT_LOOT: {
            id: 5,
            name: "Fat Loot",
            desc: "Get a new armor set"
        },
        UNDERGROUND: {
            id: 6,
            name: "Underground",
            desc: "Explore at least one cave"
        },
        AT_WORLDS_END: {
            id: 7,
            name: "At World's End",
            desc: "Reach the south shore"
        },
        COWARD: {
            id: 8,
            name: "Coward",
            desc: "Successfully escape an enemy"
        },
        TOMB_RAIDER: {
            id: 9,
            name: "Tomb Raider",
            desc: "Find the graveyard"
        },
        SKULL_COLLECTOR: {
            id: 10,
            name: "Skull Collector",
            desc: "Kill 10 skeletons",
            isCompleted: function() {
                return AchievementManager.storage.getSkeletonCount() >= 10;
            }
        },
        NINJA_LOOT: {
            id: 11,
            name: "Ninja Loot",
            desc: "Get hold of an item you didn't fight for"
        },
        NO_MANS_LAND: {
            id: 12,
            name: "No Man's Land",
            desc: "Travel through the desert"
        },
        HUNTER: {
            id: 13,
            name: "Hunter",
            desc: "Kill 50 enemies",
            isCompleted: function() {
                return AchievementManager.storage.getTotalKills() >= 50;
            }
        },
        STILL_ALIVE: {
            id: 14,
            name: "Still Alive",
            desc: "Revive your character five times",
            isCompleted: function() {
                return AchievementManager.storage.getTotalRevives() >= 5;
            }
        },
        MEATSHIELD: {
            id: 15,
            name: "Meatshield",
            desc: "Take 5,000 points of damage",
            isCompleted: function() {
                return AchievementManager.storage.getTotalDamageTaken() >= 5000;
            }
        },
        HOT_SPOT: {
            id: 16,
            name: "Hot Spot",
            desc: "Enter the volcanic mountains"
        },
        HERO: {
            id: 17,
            name: "Hero",
            desc: "Defeat the final boss"
        },
        FOXY: {
            id: 18,
            name: "Foxy",
            desc: "Find the Firefox costume",
            hidden: true
        },
        FOR_SCIENCE: {
            id: 19,
            name: "For Science",
            desc: "Enter into a portal",
            hidden: true
        },
        RICKROLLD: {
            id: 20,
            name: "Rickroll'd",
            desc: "Take some singing lessons",
            hidden: true
        }
    };

    // ── Module singleton ────────────────────────────────────────────────
    var AchievementManager = {
        storage: null,
        app: null,
        achievements: null,
        unlock_callback: null,
        audioManager: null,

        /**
         * Initialise the achievement system.  Called once from Game.run().
         *
         * @param {Storage} storage  The storage module (for counter checks).
         * @param {App}     app      The App instance (to populate the UI list).
         */
        init: function(storage, app) {
            this.storage = storage;
            this.app = app;

            // Build the live achievement objects from the definitions.
            this.achievements = {};
            _.each(DEFINITIONS, function(def, key) {
                var ach = {};
                // Copy all definition fields.
                _.extend(ach, def);
                // Default isCompleted: always true (event-driven).
                if(!ach.isCompleted) {
                    ach.isCompleted = function() { return true; };
                }
                // Default hidden: false.
                if(!ach.hidden) {
                    ach.hidden = false;
                }
                AchievementManager.achievements[key] = ach;
            });

            // Populate the achievement list in the UI.
            this.app.initAchievementList(this.achievements);

            // Restore previously unlocked achievements.
            if(this.storage.hasAlreadyPlayed()) {
                this.app.initUnlockedAchievements(this.storage.data.achievements.unlocked);
            }
        },

        /**
         * Look up an achievement by its numeric id.
         */
        getAchievementById: function(id) {
            var found = null;
            _.each(this.achievements, function(achievement) {
                if(achievement.id === parseInt(id)) {
                    found = achievement;
                }
            });
            return found;
        },

        /**
         * Register the callback fired when an achievement is unlocked.
         */
        onUnlock: function(callback) {
            this.unlock_callback = callback;
        },

        /**
         * Set the audio manager used for playing the unlock sound.
         */
        setAudioManager: function(audioManager) {
            this.audioManager = audioManager;
        },

        /**
         * Attempt to unlock the achievement identified by `name`.
         * Safe to call repeatedly — the storage layer deduplicates.
         */
        tryUnlock: function(name) {
            var achievement = null;
            if(name in this.achievements) {
                achievement = this.achievements[name];

                if(achievement.isCompleted() && this.storage.unlockAchievement(achievement.id)) {
                    if(this.unlock_callback) {
                        this.unlock_callback(achievement.id, achievement.name, achievement.desc);
                        if(this.audioManager) {
                            this.audioManager.playSound("achievement");
                        }
                    }
                }
            }
        }
    };

    return AchievementManager;
});
