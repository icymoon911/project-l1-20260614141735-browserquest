
define(function() {

    var Storage = Class.extend({
        init: function() {
            if(this.hasLocalStorage() && localStorage.data) {
                this.data = JSON.parse(localStorage.data);
            } else {
                this.resetData();
            }
        },
    
        resetData: function() {
            this.data = {
                hasAlreadyPlayed: false,
                player: {
                    name: "",
                    weapon: "",
                    armor: "",
                    image: ""
                },
                achievements: {
                    unlocked: [],
                    ratCount: 0,
                    skeletonCount: 0,
                    totalKills: 0,
                    totalDmg: 0,
                    totalRevives: 0
                }
            };
        },
    
        hasLocalStorage: function() {
            return Modernizr.localstorage;
        },
    
        save: function() {
            if(this.hasLocalStorage()) {
                localStorage.data = JSON.stringify(this.data);
            }
        },
    
        clear: function() {
            if(this.hasLocalStorage()) {
                localStorage.data = "";
                this.resetData();
            }
        },
    
        // Player
    
        hasAlreadyPlayed: function() {
            return this.data.hasAlreadyPlayed;
        },
    
        initPlayer: function(name) {
            this.data.hasAlreadyPlayed = true;
            this.setPlayerName(name);
        },
        
        setPlayerName: function(name) {
            this.data.player.name = name;
            this.save();
        },
    
        setPlayerImage: function(img) {
            this.data.player.image = img;
            this.save();
        },

        setPlayerArmor: function(armor) {
            this.data.player.armor = armor;
            this.save();
        },
    
        setPlayerWeapon: function(weapon) {
            this.data.player.weapon = weapon;
            this.save();
        },

        savePlayer: function(img, armor, weapon) {
            this.setPlayerImage(img);
            this.setPlayerArmor(armor);
            this.setPlayerWeapon(weapon);
        },
    
        // Achievements
    
        hasUnlockedAchievement: function(id) {
            return _.include(this.data.achievements.unlocked, id);
        },
    
        unlockAchievement: function(id) {
            if(!this.hasUnlockedAchievement(id)) {
                this.data.achievements.unlocked.push(id);
                this.save();
                return true;
            }
            return false;
        },
    
        getAchievementCount: function() {
            return _.size(this.data.achievements.unlocked);
        },
    
        // ── Generic counter helper ──────────────────────────────────
        // Consolidates the repeated check-cap → increment → save pattern
        // used by all achievement counters.
        //
        // @param {String} key    Property name inside this.data.achievements
        // @param {Number} max    Upper bound (counter stops incrementing past this)
        // @param {Number} amount Value to add (defaults to 1)
        incrementCounter: function(key, max, amount) {
            if(this.data.achievements[key] < max) {
                this.data.achievements[key] += (amount !== undefined ? amount : 1);
                this.save();
            }
        },

        // Angry rats
        getRatCount: function() {
            return this.data.achievements.ratCount;
        },

        incrementRatCount: function() {
            this.incrementCounter('ratCount', 10);
        },

        // Skull Collector
        getSkeletonCount: function() {
            return this.data.achievements.skeletonCount;
        },

        incrementSkeletonCount: function() {
            this.incrementCounter('skeletonCount', 10);
        },

        // Meatshield
        getTotalDamageTaken: function() {
            return this.data.achievements.totalDmg;
        },

        addDamage: function(damage) {
            this.incrementCounter('totalDmg', 5000, damage);
        },

        // Hunter
        getTotalKills: function() {
            return this.data.achievements.totalKills;
        },

        incrementTotalKills: function() {
            this.incrementCounter('totalKills', 50);
        },

        // Still Alive
        getTotalRevives: function() {
            return this.data.achievements.totalRevives;
        },

        incrementRevives: function() {
            this.incrementCounter('totalRevives', 5);
        },
    });
    
    return Storage;
});
