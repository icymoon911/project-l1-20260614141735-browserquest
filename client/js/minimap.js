
define(['mob', 'npc', 'player', 'chest'], function(Mob, Npc, Player, Chest) {

    var Minimap = Class.extend({
        init: function(game) {
            this.game = game;
            this.visible = true;
            this.mapCache = null;
            this.mapCacheDirty = true;
            this.ppt = 2; // pixels per tile (calculated in setup)

            // Pulse animation for player dot
            this.pulsePhase = 0;

            // Throttle rendering to ~15fps for performance
            this.lastRenderTime = 0;
            this.renderInterval = 66; // ms

            this.setup();
        },

        setup: function() {
            // Create container
            this.container = document.createElement('div');
            this.container.id = 'minimap-container';

            // Create canvas
            this.canvas = document.createElement('canvas');
            this.canvas.id = 'minimap-canvas';
            this.container.appendChild(this.canvas);

            // Create toggle button
            this.toggleBtn = document.createElement('div');
            this.toggleBtn.id = 'minimap-toggle';
            this.toggleBtn.title = 'Toggle Minimap (M)';
            this.toggleBtn.innerHTML = '&#x1F5FA;'; // 🗺 unicode
            this.container.appendChild(this.toggleBtn);

            // Add to canvasborder
            var canvasborder = document.getElementById('canvasborder');
            if (canvasborder) {
                canvasborder.appendChild(this.container);
            }

            this.calculateSize();
            this.bindEvents();
        },

        calculateSize: function() {
            var map = this.game.map;
            if (!map || !map.isLoaded) {
                return;
            }

            // Responsive sizing
            var maxWidth;
            if (this.game.renderer.mobile) {
                maxWidth = Math.min(100, Math.floor(window.innerWidth * 0.22));
            } else if (this.game.renderer.tablet) {
                maxWidth = Math.min(130, Math.floor(window.innerWidth * 0.2));
            } else {
                maxWidth = Math.min(220, Math.floor(window.innerWidth * 0.14));
            }

            this.ppt = Math.max(1, Math.floor(maxWidth / map.width));
            this.mapWidth = map.width * this.ppt;
            this.mapHeight = map.height * this.ppt;

            this.canvas.width = this.mapWidth;
            this.canvas.height = this.mapHeight;

            // Style container based on computed size
            this.container.style.width = this.mapWidth + 'px';
            this.container.style.height = this.mapHeight + 'px';

            this.mapCacheDirty = true;
        },

        /**
         * Pre-render the static map terrain (collision grid) to an offscreen canvas.
         * Only regenerated when mapCacheDirty is true.
         */
        generateMapCache: function() {
            var map = this.game.map;
            if (!map || !map.isLoaded || !map.grid) {
                return;
            }

            if (!this.mapCache) {
                this.mapCache = document.createElement('canvas');
            }

            this.mapCache.width = this.mapWidth;
            this.mapCache.height = this.mapHeight;

            var ctx = this.mapCache.getContext('2d');
            var ppt = this.ppt;

            // Dark background for out-of-bounds
            ctx.fillStyle = '#0d0d1a';
            ctx.fillRect(0, 0, this.mapWidth, this.mapHeight);

            // Use ImageData for fast pixel-level rendering
            var imageData = ctx.getImageData(0, 0, this.mapWidth, this.mapHeight);
            var pixels = imageData.data;

            for (var gy = 0; gy < map.height; gy++) {
                for (var gx = 0; gx < map.width; gx++) {
                    var isCollision = map.grid[gy] && map.grid[gy][gx] === 1;
                    var isPlateau = map.plateauGrid && map.plateauGrid[gy] && map.plateauGrid[gy][gx] === 1;

                    var r, g, b;
                    if (isCollision) {
                        // Dark grey for walls/obstacles
                        r = 35; g = 35; b = 45;
                    } else if (isPlateau) {
                        // Elevated terrain
                        r = 85; g = 105; b = 75;
                    } else {
                        // Walkable terrain
                        r = 60; g = 95; b = 55;
                    }

                    // Fill the ppt x ppt block for this tile
                    for (var dy = 0; dy < ppt; dy++) {
                        for (var dx = 0; dx < ppt; dx++) {
                            var px = gx * ppt + dx;
                            var py = gy * ppt + dy;
                            var idx = (py * this.mapWidth + px) * 4;
                            pixels[idx] = r;
                            pixels[idx + 1] = g;
                            pixels[idx + 2] = b;
                            pixels[idx + 3] = 255;
                        }
                    }
                }
            }

            ctx.putImageData(imageData, 0, 0);
            this.mapCacheDirty = false;
        },

        bindEvents: function() {
            var self = this;

            // Toggle button
            this.toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                self.toggle();
            });

            // Click on minimap to move player
            this.canvas.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                self.handleMinimapClick(e);
            });

            // Touch support for minimap click
            this.canvas.addEventListener('touchstart', function(e) {
                e.stopPropagation();
                e.preventDefault();
                if (e.touches.length > 0) {
                    self.handleMinimapClick(e.touches[0]);
                }
            });

            // Prevent minimap clicks from reaching the game canvas
            this.container.addEventListener('click', function(e) {
                e.stopPropagation();
            });
            this.container.addEventListener('mousedown', function(e) {
                e.stopPropagation();
            });
            this.container.addEventListener('touchstart', function(e) {
                e.stopPropagation();
            });
        },

        handleMinimapClick: function(e) {
            var game = this.game;
            if (!game.started || !game.player || game.player.isDead) {
                return;
            }

            var rect = this.canvas.getBoundingClientRect();
            var clickX = e.clientX - rect.left;
            var clickY = e.clientY - rect.top;

            // Convert minimap click to grid coordinates
            var gridX = Math.floor(clickX / this.ppt);
            var gridY = Math.floor(clickY / this.ppt);

            // Check bounds
            if (game.map.isOutOfBounds(gridX, gridY)) {
                return;
            }

            // Check collision
            if (game.map.isColliding(gridX, gridY)) {
                return;
            }

            // Move the player to the clicked position
            game.makePlayerGoTo(gridX, gridY);
        },

        toggle: function() {
            if (this.visible) {
                this.hide();
            } else {
                this.show();
            }
        },

        show: function() {
            this.visible = true;
            this.container.style.display = 'block';
            this.mapCacheDirty = true;
        },

        hide: function() {
            this.visible = false;
            this.container.style.display = 'none';
        },

        isVisible: function() {
            return this.visible;
        },

        /**
         * Called every game tick. Throttles rendering and draws the minimap.
         */
        update: function() {
            if (!this.visible) {
                return;
            }

            if (!this.game.map || !this.game.map.isLoaded) {
                return;
            }

            // Throttle rendering
            var now = this.game.currentTime || Date.now();
            if (now - this.lastRenderTime < this.renderInterval) {
                return;
            }
            this.lastRenderTime = now;

            // Advance pulse animation
            this.pulsePhase += 0.08;
            if (this.pulsePhase > Math.PI * 2) {
                this.pulsePhase -= Math.PI * 2;
            }

            this.render();
        },

        render: function() {
            // Regenerate static map cache if needed
            if (this.mapCacheDirty || !this.mapCache) {
                this.generateMapCache();
            }

            var ctx = this.canvas.getContext('2d');

            // Draw cached static terrain
            ctx.drawImage(this.mapCache, 0, 0);

            // Draw camera viewport rectangle
            this.drawCameraViewport(ctx);

            // Draw entities (mobs, NPCs, chests)
            this.drawEntities(ctx);

            // Draw player (on top of everything)
            this.drawPlayer(ctx);

            // Draw minimap border overlay (subtle inner shadow)
            this.drawBorder(ctx);
        },

        drawCameraViewport: function(ctx) {
            var camera = this.game.camera;
            if (!camera) return;

            var ppt = this.ppt;
            var x = camera.gridX * ppt;
            var y = camera.gridY * ppt;
            var w = camera.gridW * ppt;
            var h = camera.gridH * ppt;

            // Semi-transparent fill
            ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.fillRect(x, y, w, h);

            // Border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        },

        drawEntities: function(ctx) {
            var game = this.game;
            var ppt = this.ppt;
            var halfTile = Math.max(1, Math.floor(ppt / 2));
            var dotSize = Math.max(2, ppt);

            _.each(game.entities, function(entity) {
                if (entity instanceof Player) {
                    return; // Player drawn separately
                }

                var x = entity.gridX * ppt;
                var y = entity.gridY * ppt;

                if (entity instanceof Mob) {
                    ctx.fillStyle = '#ff4444';
                    ctx.fillRect(x, y, dotSize, dotSize);
                } else if (entity instanceof Npc) {
                    ctx.fillStyle = '#4488ff';
                    ctx.fillRect(x, y, dotSize, dotSize);
                } else if (entity instanceof Chest) {
                    ctx.fillStyle = '#ffcc00';
                    ctx.fillRect(x, y, dotSize, dotSize);
                }
            });
        },

        drawPlayer: function(ctx) {
            var player = this.game.player;
            if (!player) return;

            var ppt = this.ppt;
            var x = player.gridX * ppt;
            var y = player.gridY * ppt;
            var center = ppt / 2;

            // Pulsing glow effect
            var pulse = 0.4 + 0.6 * Math.abs(Math.sin(this.pulsePhase));
            var glowSize = Math.max(4, ppt + 3);
            var glowOffset = (glowSize - ppt) / 2;

            ctx.fillStyle = 'rgba(0, 255, 100, ' + (pulse * 0.3).toFixed(2) + ')';
            ctx.fillRect(x - glowOffset, y - glowOffset, glowSize, glowSize);

            // Solid player dot
            var dotSize = Math.max(3, ppt + 1);
            var dotOffset = (dotSize - ppt) / 2;
            ctx.fillStyle = '#00ff66';
            ctx.fillRect(x - dotOffset, y - dotOffset, dotSize, dotSize);

            // Bright center
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x, y, Math.max(1, ppt - 1), Math.max(1, ppt - 1));
        },

        drawBorder: function(ctx) {
            // Subtle inner border
            ctx.strokeStyle = 'rgba(100, 140, 180, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(0.5, 0.5, this.mapWidth - 1, this.mapHeight - 1);
        },

        /**
         * Called on window resize to recalculate minimap dimensions.
         */
        onResize: function() {
            if (this.game.map && this.game.map.isLoaded) {
                this.calculateSize();
            }
        }
    });

    return Minimap;
});
