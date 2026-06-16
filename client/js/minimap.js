
define(['mob', 'npc', 'chest', 'player'],
function(Mob, Npc, Chest, Player) {

    var Minimap = Class.extend({
        init: function(game, canvasId) {
            this.game = game;
            this.canvas = document.getElementById(canvasId);
            this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
            this.visible = true;
            this.mapImageData = null;

            // Minimap display size (will be adjusted for responsiveness)
            this.width = 200;
            this.height = 150;

            // Colors
            this.colors = {
                background: '#1a1a2e',
                walkable: '#3a5a40',
                collision: '#2d2d44',
                player: '#00ff88',
                mob: '#ff4444',
                npc: '#4488ff',
                chest: '#ffcc00',
                viewport: 'rgba(255, 255, 255, 0.4)',
                border: '#555577'
            };

            this._resize();
            this._bindEvents();
        },

        _resize: function() {
            var w = window.innerWidth;
            var h = window.innerHeight;

            if (w <= 600) {
                // Mobile: smaller minimap
                this.width = 120;
                this.height = 90;
            } else if (w <= 1000) {
                // Tablet
                this.width = 150;
                this.height = 112;
            } else {
                // Desktop
                this.width = 200;
                this.height = 150;
            }

            if (this.canvas) {
                this.canvas.width = this.width;
                this.canvas.height = this.height;
            }

            // Invalidate cached map image on resize
            this.mapImageData = null;
        },

        _bindEvents: function() {
            var self = this;

            if (!this.canvas) return;

            // Click handler: move player to clicked position
            this.canvas.addEventListener('click', function(e) {
                if (!self.visible || !self.game || !self.game.started || !self.game.player) return;
                if (!self.game.map || !self.game.map.isLoaded) return;

                var rect = self.canvas.getBoundingClientRect();
                var clickX = e.clientX - rect.left;
                var clickY = e.clientY - rect.top;

                var map = self.game.map;
                var gridX = Math.floor((clickX / self.width) * map.width);
                var gridY = Math.floor((clickY / self.height) * map.height);

                // Clamp to map bounds
                gridX = Math.max(0, Math.min(map.width - 1, gridX));
                gridY = Math.max(0, Math.min(map.height - 1, gridY));

                // Ignore clicks on collision tiles
                if (map.isColliding(gridX, gridY)) return;

                // Move the player to the clicked position
                self.game.makePlayerGoTo(gridX, gridY);
            });

            // Prevent click from propagating to the game canvas
            this.canvas.addEventListener('mousedown', function(e) {
                e.stopPropagation();
            });
            this.canvas.addEventListener('touchstart', function(e) {
                e.stopPropagation();
            });
        },

        toggle: function() {
            this.visible = !this.visible;
            if (this.canvas) {
                this.canvas.style.display = this.visible ? 'block' : 'none';
            }
            // When hidden, clear the canvas to save rendering performance
            if (!this.visible && this.ctx) {
                this.ctx.clearRect(0, 0, this.width, this.height);
            }
        },

        show: function() {
            this.visible = true;
            if (this.canvas) {
                this.canvas.style.display = 'block';
            }
        },

        hide: function() {
            this.visible = false;
            if (this.canvas) {
                this.canvas.style.display = 'none';
            }
            if (this.ctx) {
                this.ctx.clearRect(0, 0, this.width, this.height);
            }
        },

        isVisible: function() {
            return this.visible;
        },

        /**
         * Pre-render the static map (collision grid) to an offscreen canvas.
         * This is cached and only regenerated when the map changes or minimap is resized.
         */
        _renderMapImage: function() {
            var map = this.game.map;
            if (!map || !map.isLoaded || !map.grid) return;

            var offscreen = document.createElement('canvas');
            offscreen.width = this.width;
            offscreen.height = this.height;
            var octx = offscreen.getContext('2d');

            var mapW = map.width;
            var mapH = map.height;
            var scaleX = this.width / mapW;
            var scaleY = this.height / mapH;

            // Fill background
            octx.fillStyle = this.colors.background;
            octx.fillRect(0, 0, this.width, this.height);

            // Draw each tile as either walkable or collision
            // For performance, we batch by color
            var collisionColor = this.colors.collision;
            var walkableColor = this.colors.walkable;

            // Use pixel-level rendering for small maps, block rendering for larger ones
            var cellW = Math.max(1, scaleX);
            var cellH = Math.max(1, scaleY);

            for (var y = 0; y < mapH; y++) {
                for (var x = 0; x < mapW; x++) {
                    if (map.grid[y] && map.grid[y][x] === 1) {
                        octx.fillStyle = collisionColor;
                    } else {
                        octx.fillStyle = walkableColor;
                    }
                    octx.fillRect(
                        Math.floor(x * scaleX),
                        Math.floor(y * scaleY),
                        Math.ceil(cellW),
                        Math.ceil(cellH)
                    );
                }
            }

            this.mapImageData = offscreen;
            this._cachedMapW = mapW;
            this._cachedMapH = mapH;
        },

        /**
         * Main draw method - called each frame from the renderer.
         */
        draw: function() {
            if (!this.visible || !this.ctx) return;
            if (!this.game || !this.game.started || !this.game.map || !this.game.map.isLoaded) return;

            var ctx = this.ctx;
            var map = this.game.map;

            // Render static map image (cached)
            if (!this.mapImageData || this._cachedMapW !== map.width || this._cachedMapH !== map.height) {
                this._renderMapImage();
            }

            // Draw cached map
            if (this.mapImageData) {
                ctx.drawImage(this.mapImageData, 0, 0);
            }

            var mapW = map.width;
            var mapH = map.height;
            var scaleX = this.width / mapW;
            var scaleY = this.height / mapH;

            // Draw entities
            this._drawEntities(ctx, scaleX, scaleY);

            // Draw player
            this._drawPlayer(ctx, scaleX, scaleY);

            // Draw camera viewport rectangle
            this._drawViewport(ctx, scaleX, scaleY);

            // Draw border
            ctx.strokeStyle = this.colors.border;
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, this.width, this.height);
        },

        _drawPlayer: function(ctx, scaleX, scaleY) {
            var player = this.game.player;
            if (!player) return;

            var px = player.gridX * scaleX;
            var py = player.gridY * scaleY;

            // Draw a bright dot for the player
            ctx.fillStyle = this.colors.player;
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();

            // Add a white outline for visibility
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
        },

        _drawEntities: function(ctx, scaleX, scaleY) {
            var entities = this.game.entities;
            var playerId = this.game.playerId;

            for (var id in entities) {
                var entity = entities[id];
                if (!entity || entity.id === playerId) continue;

                var x = entity.gridX * scaleX;
                var y = entity.gridY * scaleY;
                var color = null;
                var radius = 2;

                if (entity instanceof Mob) {
                    color = this.colors.mob;
                    radius = 2;
                } else if (entity instanceof Npc) {
                    color = this.colors.npc;
                    radius = 2;
                } else if (entity instanceof Chest) {
                    color = this.colors.chest;
                    radius = 2.5;
                }

                if (color) {
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        },

        _drawViewport: function(ctx, scaleX, scaleY) {
            var camera = this.game.camera || (this.game.renderer && this.game.renderer.camera);
            if (!camera) return;

            var vx = camera.gridX * scaleX;
            var vy = camera.gridY * scaleY;
            var vw = camera.gridW * scaleX;
            var vh = camera.gridH * scaleY;

            ctx.strokeStyle = this.colors.viewport;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(vx, vy, vw, vh);

            // Semi-transparent fill
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.fillRect(vx, vy, vw, vh);
        }
    });

    return Minimap;
});
