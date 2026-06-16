
define(function() {

    // Counter configuration: each key maps to its max value.
    // To add a new counter, simply add an entry here.
    var COUNTER_CONFIG = {
        ratCount:      { max: 10 },
        skeletonCount: { max: 10 },
        totalKills:    { max: 50 },
        totalDmg:      { max: 5000 },
        totalRevives:  { max: 5 }
    };

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

        // Generic counter methods — all achievement counters share this logic.
        // To add a new counter, add an entry to COUNTER_CONFIG above.

        getCounter: function(key) {
            return this.data.achievements[key] || 0;
        },

        incrementCounter: function(key, amount) {
            var config = COUNTER_CONFIG[key];
            if(config) {
                var current = this.data.achievements[key];
                if(current < config.max) {
                    this.data.achievements[key] += (amount !== undefined ? amount : 1);
                    this.save();
                }
            }
        },

        // Named accessors — thin wrappers over the generic counter methods.

        // Angry rats
        getRatCount: function() {
            return this.getCounter('ratCount');
        },

        incrementRatCount: function() {
            this.incrementCounter('ratCount');
        },

        // Skull Collector
        getSkeletonCount: function() {
            return this.getCounter('skeletonCount');
        },

        incrementSkeletonCount: function() {
            this.incrementCounter('skeletonCount');
        },

        // Meatshield
        getTotalDamageTaken: function() {
            return this.getCounter('totalDmg');
        },

        addDamage: function(damage) {
            this.incrementCounter('totalDmg', damage);
        },

        // Hunter
        getTotalKills: function() {
            return this.getCounter('totalKills');
        },

        incrementTotalKills: function() {
            this.incrementCounter('totalKills');
        },

        // Still Alive
        getTotalRevives: function() {
            return this.getCounter('totalRevives');
        },

        incrementRevives: function() {
            this.incrementCounter('totalRevives');
        }
    });

    return Storage;
});
