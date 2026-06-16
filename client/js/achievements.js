
define(['../../shared/js/gametypes'], function() {

    /**
     * AchievementManager - Manages all achievement definitions, unlock logic,
     * and achievement-related event handling.
     *
     * To add a new achievement, simply add an entry to the `definitions` object
     * below and call the appropriate event method from game logic.
     */
    var AchievementManager = {

        /**
         * Initialize the achievement manager with a reference to the game.
         * Sets up achievement definitions and registers them with the app UI.
         */
        init: function(game) {
            var self = this;
            this.game = game;
            this.storage = game.storage;

            // ── Achievement definitions ──────────────────────────────
            // Each entry: { id, name, desc, isCompleted?, hidden? }
            // isCompleted defaults to always-true if omitted.
            this.definitions = {
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
                        return self.storage.getRatCount() >= 10;
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
                        return self.storage.getSkeletonCount() >= 10;
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
                        return self.storage.getTotalKills() >= 50;
                    }
                },
                STILL_ALIVE: {
                    id: 14,
                    name: "Still Alive",
                    desc: "Revive your character five times",
                    isCompleted: function() {
                        return self.storage.getTotalRevives() >= 5;
                    }
                },
                MEATSHIELD: {
                    id: 15,
                    name: "Meatshield",
                    desc: "Take 5,000 points of damage",
                    isCompleted: function() {
                        return self.storage.getTotalDamageTaken() >= 5000;
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

            // Fill in default isCompleted / hidden for entries that omit them
            _.each(this.definitions, function(obj) {
                if(!obj.isCompleted) {
                    obj.isCompleted = function() { return true; };
                }
                if(!obj.hidden) {
                    obj.hidden = false;
                }
            });

            // Expose definitions on the game for backward compat (app.js reads game.getAchievementById)
            game.achievements = this.definitions;

            // Initialize the UI achievement list
            game.app.initAchievementList(this.definitions);

            // Restore previously unlocked achievements
            if(this.storage.hasAlreadyPlayed()) {
                game.app.initUnlockedAchievements(this.storage.data.achievements.unlocked);
            }
        },

        // ── Core unlock logic ───────────────────────────────────────

        /**
         * Attempt to unlock an achievement by its key name.
         * Checks completion condition, persists to storage, fires callback and sound.
         */
        tryUnlock: function(name) {
            if(name in this.definitions) {
                var achievement = this.definitions[name];

                if(achievement.isCompleted() && this.storage.unlockAchievement(achievement.id)) {
                    if(this.game.unlock_callback) {
                        this.game.unlock_callback(achievement.id, achievement.name, achievement.desc);
                        this.game.audioManager.playSound("achievement");
                    }
                }
            }
        },

        /**
         * Look up an achievement by its numeric ID.
         */
        getById: function(id) {
            var found = null;
            _.each(this.definitions, function(achievement) {
                if(achievement.id === parseInt(id)) {
                    found = achievement;
                }
            });
            return found;
        },

        // ── Event-driven achievement triggers ───────────────────────
        // Called by handlers instead of hardcoded achievement names.

        /**
         * Called when the player receives the welcome message from the server.
         */
        onPlayerWelcome: function() {
            var self = this;
            setTimeout(function() {
                self.tryUnlock("STILL_ALIVE");
            }, 1500);
        },

        /**
         * Called when a mob is killed by the player.
         * Handles kill counters and kill-based achievements.
         */
        onMobKilled: function(kind) {
            this.storage.incrementTotalKills();
            this.tryUnlock("HUNTER");

            if(kind === Types.Entities.RAT) {
                this.storage.incrementRatCount();
                this.tryUnlock("ANGRY_RATS");
            }

            if(kind === Types.Entities.SKELETON || kind === Types.Entities.SKELETON2) {
                this.storage.incrementSkeletonCount();
                this.tryUnlock("SKULL_COLLECTOR");
            }

            if(kind === Types.Entities.BOSS) {
                this.tryUnlock("HERO");
            }
        },

        /**
         * Called when the player successfully loots an item.
         */
        onItemLooted: function(item) {
            if(item.type === "armor") {
                this.tryUnlock("FAT_LOOT");
            }

            if(item.type === "weapon") {
                this.tryUnlock("A_TRUE_WARRIOR");
            }

            if(item.kind === Types.Entities.CAKE) {
                this.tryUnlock("FOR_SCIENCE");
            }

            if(item.kind === Types.Entities.FIREPOTION) {
                this.tryUnlock("FOXY");
            }

            if(item.wasDropped && !_(item.playersInvolved).include(this.game.playerId)) {
                this.tryUnlock("NINJA_LOOT");
            }
        },

        /**
         * Called on each player step to check location-based achievements.
         */
        onPlayerStep: function() {
            var px = this.game.player.gridX,
                py = this.game.player.gridY;

            if((px <= 85 && py <= 179 && py > 178) || (px <= 85 && py <= 266 && py > 265)) {
                this.tryUnlock("INTO_THE_WILD");
            }

            if(px <= 85 && py <= 293 && py > 292) {
                this.tryUnlock("AT_WORLDS_END");
            }

            if(px <= 85 && py <= 100 && py > 99) {
                this.tryUnlock("NO_MANS_LAND");
            }

            if(px <= 85 && py <= 51 && py > 50) {
                this.tryUnlock("HOT_SPOT");
            }

            if(px <= 27 && py <= 123 && py > 112) {
                this.tryUnlock("TOMB_RAIDER");
            }
        },

        /**
         * Called when the player goes through a door and may be escaping attackers.
         */
        onPlayerEnterDoor: function() {
            var self = this,
                game = this.game;

            if(_.size(game.player.attackers) > 0) {
                setTimeout(function() { self.tryUnlock("COWARD"); }, 500);
            }

            // Check underground achievement based on surrounding music
            var music = game.audioManager.getSurroundingMusic(game.player);
            if(music && music.name === 'cave') {
                this.tryUnlock("UNDERGROUND");
            }
        },

        /**
         * Called when a non-player entity moves away while attacking the player.
         */
        onPlayerEscape: function() {
            this.tryUnlock("COWARD");
        },

        /**
         * Called when the player takes damage.
         */
        onPlayerHurt: function(damage) {
            this.storage.addDamage(damage);
            this.tryUnlock("MEATSHIELD");
        },

        /**
         * Called when the player talks to an NPC.
         */
        onNpcTalked: function(npc) {
            this.tryUnlock("SMALL_TALK");

            if(npc.kind === Types.Entities.RICK) {
                this.tryUnlock("RICKROLLD");
            }
        },

        /**
         * Called when the player revives (restarts after death).
         * Increments the revive counter (STILL_ALIVE is checked on welcome).
         */
        onPlayerRevive: function() {
            this.storage.incrementRevives();
        }
    };

    return AchievementManager;
});
