
define(['mob', 'mobs', 'player', '../../shared/js/gametypes'],
function(Mob, Mobs, Player) {

    /**
     * CharacterEvents - Factory for binding shared event handlers to Character entities.
     *
     * Both the local player and remote characters (other players, mobs) share a common
     * set of movement / pathing / death events.  Differences are expressed through the
     * `isPlayer` flag and optional callbacks.
     */
    var CharacterEvents = {

        /**
         * Bind the full set of character lifecycle events.
         *
         * @param {Character} character  The character entity to bind events to.
         * @param {Game}      game       The Game instance (provides grid helpers, etc.).
         * @param {Object}    options
         *   - isPlayer {Boolean}           True when binding the local player.
         *   - onStopPathingPre {Function}   Optional callback invoked at the start of
         *                                   onStopPathing for the player (looting, doors, …).
         */
        bindCharacterEvents: function(character, game, options) {
            var isPlayer = options && options.isPlayer;

            // ── onBeforeStep ─────────────────────────────────────────
            character.onBeforeStep(function() {
                if(isPlayer) {
                    var blockingEntity = game.getEntityAt(character.nextGridX, character.nextGridY);
                    if(blockingEntity && blockingEntity.id !== game.playerId) {
                        log.debug("Blocked by " + blockingEntity.id);
                    }
                }
                game.unregisterEntityPosition(character);
            });

            // ── onStep ───────────────────────────────────────────────
            character.onStep(function() {
                // Player: always process. Non-player: skip if dying.
                if(isPlayer || !character.isDying) {

                    // Dual-position registration (player guards on hasNextStep)
                    if(isPlayer ? character.hasNextStep() : true) {
                        game.registerEntityDualPosition(character);
                    }

                    // Player-only: zoning detection
                    if(isPlayer && game.isZoningTile(character.gridX, character.gridY)) {
                        game.enqueueZoningFrom(character.gridX, character.gridY);
                    }

                    // Shared: attackers follow / face target
                    character.forEachAttacker(function(attacker) {
                        if(attacker.isAdjacent(attacker.target)) {
                            attacker.lookAtTarget();
                        } else {
                            attacker.follow(character);
                        }
                    });

                    // Player-only: location achievements, checkpoint, music
                    if(isPlayer) {
                        game.achievementManager.onPlayerStep();
                        game.updatePlayerCheckpoint();
                        if(!character.isDead) {
                            game.audioManager.updateMusic();
                        }
                    }
                }
            });

            // ── onStopPathing ────────────────────────────────────────
            character.onStopPathing(function(x, y) {
                // Non-player: skip everything if dying
                if(!isPlayer && character.isDying) {
                    return;
                }

                // Shared: face target
                if(isPlayer) {
                    if(character.hasTarget()) {
                        character.lookAtTarget();
                    }
                } else {
                    if(character.hasTarget() && character.isAdjacent(character.target)) {
                        character.lookAtTarget();
                    }
                }

                // Player-only: pre-processing (looting, doors, NPC talk, chests)
                if(isPlayer && options.onStopPathingPre) {
                    options.onStopPathingPre(x, y);
                }

                // Non-player Player instances (other players seen remotely): door teleport
                if(!isPlayer && character instanceof Player) {
                    var gridX = character.destination.gridX,
                        gridY = character.destination.gridY;

                    if(game.map.isDoor(gridX, gridY)) {
                        var dest = game.map.getDoorDestination(gridX, gridY);
                        character.setGridPosition(dest.x, dest.y);
                    }
                }

                // Shared: attackers re-follow if not adjacent
                character.forEachAttacker(function(attacker) {
                    if(!attacker.isAdjacentNonDiagonal(character)) {
                        // For non-player characters, don't make the local player follow
                        if(!isPlayer && attacker.id === game.playerId) {
                            return;
                        }
                        attacker.follow(character);
                    }
                });

                // Shared: re-register position on the grid
                game.unregisterEntityPosition(character);
                game.registerEntityPosition(character);
            });

            // ── onRequestPath ────────────────────────────────────────
            character.onRequestPath(function(x, y) {
                var ignored = [character]; // Always ignore self

                if(isPlayer) {
                    // Player: ignore target only
                    if(character.hasTarget()) {
                        ignored.push(character.target);
                    }
                } else {
                    // Non-player: ignore target (or previous target) and their attackers
                    var ignoreTarget = function(target) {
                        ignored.push(target);
                        target.forEachAttacker(function(attacker) {
                            ignored.push(attacker);
                        });
                    };

                    if(character.hasTarget()) {
                        ignoreTarget(character.target);
                    } else if(character.previousTarget) {
                        // If repositioning before attacking again, ignore previous target
                        // See: tryMovingToADifferentTile()
                        ignoreTarget(character.previousTarget);
                    }
                }

                return game.findPath(character, x, y, ignored);
            });

            // ── onDeath ──────────────────────────────────────────────
            character.onDeath(function() {
                if(isPlayer) {
                    // ── Player death ─────────────────────────────
                    log.info(game.playerId + " is dead");

                    character.stopBlinking();
                    character.setSprite(game.sprites["death"]);
                    character.animate("death", 120, 1, function() {
                        log.info(game.playerId + " was removed");

                        game.removeEntity(character);
                        game.removeFromRenderingGrid(character, character.gridX, character.gridY);

                        game.player = null;
                        game.client.disable();

                        setTimeout(function() {
                            game.playerdeath_callback();
                        }, 1000);
                    });

                    character.forEachAttacker(function(attacker) {
                        attacker.disengage();
                        attacker.idle();
                    });

                    game.audioManager.fadeOutCurrentMusic();
                    game.audioManager.playSound("death");

                } else {
                    // ── Character / mob death ────────────────────
                    log.info(character.id + " is dead");

                    if(character instanceof Mob) {
                        // Keep track of where mobs die to spawn dropped items at the right position
                        game.deathpositions[character.id] = {x: character.gridX, y: character.gridY};
                    }

                    character.isDying = true;
                    character.setSprite(game.sprites[character instanceof Mobs.Rat ? "rat" : "death"]);
                    character.animate("death", 120, 1, function() {
                        log.info(character.id + " was removed");
                        game.removeEntity(character);
                        game.removeFromRenderingGrid(character, character.gridX, character.gridY);
                    });

                    character.forEachAttacker(function(attacker) {
                        attacker.disengage();
                    });

                    if(game.player && game.player.target && game.player.target.id === character.id) {
                        game.player.disengage();
                    }

                    // Remove from grids immediately so fast-click looting is not blocked
                    game.removeFromEntityGrid(character, character.gridX, character.gridY);
                    game.removeFromPathingGrid(character.gridX, character.gridY);

                    if(game.camera.isVisible(character)) {
                        game.audioManager.playSound("kill" + Math.floor(Math.random() * 2 + 1));
                    }

                    game.updateCursor();
                }
            });

            // ── onHasMoved ───────────────────────────────────────────
            character.onHasMoved(function(ch) {
                game.assignBubbleTo(ch); // Make chat bubbles follow moving entities
            });
        }
    };

    return CharacterEvents;
});
