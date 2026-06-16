
/**
 * EntityBinders — reusable factory functions for binding the standard set of
 * character events (onBeforeStep, onStep, onStopPathing, onRequestPath,
 * onDeath, onHasMoved).
 *
 * The same `bindCharacterEvents` function is used for both the local player
 * and every other spawned character.  Behavioural differences are expressed
 * through the `hooks` object rather than code duplication.
 */
define(['mob', 'player', 'mobs', '../../shared/js/gametypes'],
function(Mob, Player, Mobs) {

    /**
     * Bind the common character event suite.
     *
     * @param {Character} entity  The character entity (player or other).
     * @param {Game}      game    The Game instance.
     * @param {Object}   [hooks]  Optional customisation points:
     *
     *  isPlayer           {Boolean}  true when binding the local player.
     *
     *  onBeforeStepExtra  {Function} Called before the shared unregisterEntityPosition.
     *
     *  stepGuard          {Function} If provided and returns false, the onStep
     *                                 handler is skipped entirely.
     *                                 (Non-player characters use this to skip
     *                                  when the entity is dying.)
     *
     *  registerDualCond   {Function} If provided, dual-position registration
     *                                 only happens when it returns true.
     *                                 (Player uses `hasNextStep()`.)
     *
     *  onStepExtra        {Function} Called after the shared step logic
     *                                 (zoning, achievements, checkpoint, etc.).
     *
     *  stopPathGuard      {Function} If provided and returns false, the
     *                                 onStopPathing handler is skipped.
     *
     *  onStopPathingPre   {Function} Called at the start of onStopPathing,
     *                                 after the shared lookAtTarget.
     *
     *  onStopPathingExtra {Function} Called in onStopPathing for extra logic
     *                                 (loot, doors, npc talk, chest, etc.).
     *
     *  requestPathIgnored {Function} Returns an array of extra entities to
     *                                 ignore when path-finding.  If omitted,
     *                                 the default logic ignores the target
     *                                 (or previous target) and its attackers.
     *
     *  onDeathPre         {Function} Called before the shared death logic
     *                                 (e.g. player.stopBlinking).
     *
     *  onDeathAnimDone    {Function} Called inside the death-animation
     *                                 completion callback, before the shared
     *                                 removeEntity (e.g. nulling the player
     *                                 reference and disabling the client).
     *
     *  onDeathPost        {Function} Called after the shared death logic
     *                                 (e.g. fade music, play death sound).
     */
    function bindCharacterEvents(entity, game, hooks) {
        hooks = hooks || {};
        var isPlayer = hooks.isPlayer || false;

        // ── onBeforeStep ─────────────────────────────────────────────
        entity.onBeforeStep(function() {
            if(hooks.onBeforeStepExtra) {
                hooks.onBeforeStepExtra();
            }
            game.unregisterEntityPosition(entity);
        });

        // ── onStep ───────────────────────────────────────────────────
        entity.onStep(function() {
            if(hooks.stepGuard && !hooks.stepGuard()) {
                return;
            }

            if(hooks.registerDualCond) {
                if(hooks.registerDualCond()) {
                    game.registerEntityDualPosition(entity);
                }
            } else {
                game.registerEntityDualPosition(entity);
            }

            entity.forEachAttacker(function(attacker) {
                if(attacker.isAdjacent(attacker.target)) {
                    attacker.lookAtTarget();
                } else {
                    attacker.follow(entity);
                }
            });

            if(hooks.onStepExtra) {
                hooks.onStepExtra();
            }
        });

        // ── onStopPathing ────────────────────────────────────────────
        entity.onStopPathing(function(x, y) {
            if(hooks.stopPathGuard && !hooks.stopPathGuard()) {
                return;
            }

            // Shared: look at target.
            // Non-player: only if adjacent.  Player: always if has target.
            if(entity.hasTarget()) {
                if(!isPlayer && !entity.isAdjacent(entity.target)) {
                    // skip lookAtTarget for distant non-player targets
                } else {
                    entity.lookAtTarget();
                }
            }

            // Pre-hook (player sets selectedCellVisible = false, etc.)
            if(hooks.onStopPathingPre) {
                hooks.onStopPathingPre(x, y);
            }

            // Door handling for other Player instances (non-player path).
            if(!isPlayer && entity instanceof Player) {
                var gridX = entity.destination.gridX,
                    gridY = entity.destination.gridY;
                if(game.map.isDoor(gridX, gridY)) {
                    var dest = game.map.getDoorDestination(gridX, gridY);
                    entity.setGridPosition(dest.x, dest.y);
                }
            }

            // Extra logic (player loot, doors, npc talk, chest …)
            if(hooks.onStopPathingExtra) {
                hooks.onStopPathingExtra(x, y);
            }

            // Shared: attackers follow if not adjacent.
            entity.forEachAttacker(function(attacker) {
                if(isPlayer) {
                    if(!attacker.isAdjacentNonDiagonal(entity)) {
                        attacker.follow(entity);
                    }
                } else {
                    if(!attacker.isAdjacentNonDiagonal(entity) && attacker.id !== game.playerId) {
                        attacker.follow(entity);
                    }
                }
            });

            game.unregisterEntityPosition(entity);
            game.registerEntityPosition(entity);
        });

        // ── onRequestPath ────────────────────────────────────────────
        entity.onRequestPath(function(x, y) {
            var ignored = [entity]; // Always ignore self

            if(hooks.requestPathIgnored) {
                // Player-style: caller supplies the exact ignore list.
                var extra = hooks.requestPathIgnored();
                if(extra) {
                    ignored = ignored.concat(extra);
                }
            } else {
                // Non-player default: ignore target (or previous target)
                // and all of that target's attackers.
                var ignoreTarget = function(target) {
                    ignored.push(target);
                    target.forEachAttacker(function(attacker) {
                        ignored.push(attacker);
                    });
                };
                if(entity.hasTarget()) {
                    ignoreTarget(entity.target);
                } else if(entity.previousTarget) {
                    ignoreTarget(entity.previousTarget);
                }
            }

            return game.findPath(entity, x, y, ignored);
        });

        // ── onDeath ──────────────────────────────────────────────────
        entity.onDeath(function() {
            log.info(entity.id + " is dead");

            // Pre-hook (player: stopBlinking).
            if(hooks.onDeathPre) {
                hooks.onDeathPre();
            }

            // Non-player: track death positions for mob loot drops.
            if(entity instanceof Mob) {
                game.deathpositions[entity.id] = {x: entity.gridX, y: entity.gridY};
            }

            // Non-player: set dying flag.
            if(!isPlayer) {
                entity.isDying = true;
            }

            // Choose death sprite (rats keep their own sprite).
            if(!isPlayer && entity instanceof Mobs.Rat) {
                entity.setSprite(game.sprites["rat"]);
            } else {
                entity.setSprite(game.sprites["death"]);
            }

            entity.animate("death", 120, 1, function() {
                log.info(entity.id + " was removed");

                // Animation-complete hook (player: null ref, disable client).
                if(hooks.onDeathAnimDone) {
                    hooks.onDeathAnimDone();
                }

                game.removeEntity(entity);
                game.removeFromRenderingGrid(entity, entity.gridX, entity.gridY);
            });

            entity.forEachAttacker(function(attacker) {
                attacker.disengage();
                if(isPlayer) {
                    attacker.idle();
                }
            });

            // Post-hook (player: fade music, play death sound).
            if(hooks.onDeathPost) {
                hooks.onDeathPost();
            }

            // Non-player extras: disengage player if targeted, clear grids,
            // play kill sound, update cursor.
            if(!isPlayer) {
                if(game.player && game.player.target && game.player.target.id === entity.id) {
                    game.player.disengage();
                }

                // Remove from both grids immediately so fast-click looting
                // is not blocked by the dying entity.
                game.removeFromEntityGrid(entity, entity.gridX, entity.gridY);
                game.removeFromPathingGrid(entity.gridX, entity.gridY);

                if(game.camera.isVisible(entity)) {
                    game.audioManager.playSound("kill" + Math.floor(Math.random() * 2 + 1));
                }

                game.updateCursor();
            }
        });

        // ── onHasMoved ───────────────────────────────────────────────
        entity.onHasMoved(function(movedEntity) {
            game.assignBubbleTo(movedEntity); // Make chat bubbles follow moving entities
        });
    }

    return {
        bindCharacterEvents: bindCharacterEvents
    };
});
