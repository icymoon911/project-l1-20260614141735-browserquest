
/**
 * MessageHandlers — registers every `client.onXxx` callback that was
 * previously inlined inside Game.connect().
 *
 * The Game instance is passed via dependency injection; this module has
 * no hard dependency on the Game class itself.
 */
define(['entitybinders', 'character', 'player', 'mob', 'chest', 'npc',
        'mobs', 'item', 'exceptions', '../../shared/js/gametypes'],
function(EntityBinders, Character, Player, Mob, Chest, Npc,
         Mobs, Item, Exceptions) {

    /**
     * Wire up every server-message handler on `game.client`.
     *
     * @param {Game}     game              The Game instance.
     * @param {Function} started_callback  Called once the game loop starts.
     */
    function registerMessageHandlers(game, started_callback) {
        var client = game.client;

        // ── Dispatcher ───────────────────────────────────────────────
        client.onDispatched(function(host, port) {
            log.debug("Dispatched to game server " + host + ":" + port);

            game.client.host = host;
            game.client.port = port;
            game.client.connect(); // connect to actual game server
        });

        // ── Connected ────────────────────────────────────────────────
        client.onConnected(function() {
            log.info("Starting client/server handshake");

            game.player.name = game.username;
            game.started = true;

            game.sendHello(game.player);
        });

        // ── Entity list ──────────────────────────────────────────────
        client.onEntityList(function(list) {
            var entityIds = _.pluck(game.entities, 'id'),
                knownIds = _.intersection(entityIds, list),
                newIds = _.difference(list, knownIds);

            game.obsoleteEntities = _.reject(game.entities, function(entity) {
                return _.include(knownIds, entity.id) || entity.id === game.player.id;
            });

            // Destroy entities outside of the player's zone group
            game.removeObsoleteEntities();

            // Ask the server for spawn information about unknown entities
            if(_.size(newIds) > 0) {
                game.client.sendWho(newIds);
            }
        });

        // ── Welcome (player handshake complete) ──────────────────────
        client.onWelcome(function(id, name, x, y, hp) {
            log.info("Received player ID from server : " + id);
            game.player.id = id;
            game.playerId = id;
            // Always accept name received from the server which will
            // sanitize and shorten names exceeding the allowed length.
            game.player.name = name;
            game.player.setGridPosition(x, y);
            game.player.setMaxHitPoints(hp);

            game.updateBars();
            game.resetCamera();
            game.updatePlateauMode();
            game.audioManager.updateMusic();

            game.addEntity(game.player);
            game.player.dirtyRect = game.renderer.getEntityBoundingRect(game.player);

            setTimeout(function() {
                game.tryUnlockingAchievement("STILL_ALIVE");
            }, 1500);

            if(!game.storage.hasAlreadyPlayed()) {
                game.storage.initPlayer(game.player.name);
                game.storage.savePlayer(game.renderer.getPlayerImage(),
                                        game.player.getSpriteName(),
                                        game.player.getWeaponName());
                game.showNotification("Welcome to BrowserQuest!");
            } else {
                game.showNotification("Welcome back to BrowserQuest!");
                game.storage.setPlayerName(name);
            }

            // ── Player event bindings (shared + player-specific) ─────
            _bindPlayerEvents(game);

            // ── Remaining server-message handlers ────────────────────
            _registerSpawnHandlers(game);
            _registerEntityHandlers(game);
            _registerCombatHandlers(game);
            _registerMiscHandlers(game);

            // ── Kick off the game loop ───────────────────────────────
            game.gamestart_callback();

            if(game.hasNeverStarted) {
                game.start();
                started_callback();
            }
        });
    }

    // ====================================================================
    // Player event bindings
    // ====================================================================

    function _bindPlayerEvents(game) {
        var player = game.player;

        // Use the shared bindCharacterEvents with player-specific hooks.
        EntityBinders.bindCharacterEvents(player, game, {
            isPlayer: true,

            // onBeforeStep: log blocking entity before unregistering.
            onBeforeStepExtra: function() {
                var blockingEntity = game.getEntityAt(player.nextGridX, player.nextGridY);
                if(blockingEntity && blockingEntity.id !== game.playerId) {
                    log.debug("Blocked by " + blockingEntity.id);
                }
            },

            // onStep: only register dual position when there is a next step.
            registerDualCond: function() {
                return player.hasNextStep();
            },

            // onStep: zoning, achievements, checkpoint, music.
            onStepExtra: function() {
                if(game.isZoningTile(player.gridX, player.gridY)) {
                    game.enqueueZoningFrom(player.gridX, player.gridY);
                }

                if((player.gridX <= 85 && player.gridY <= 179 && player.gridY > 178) || (player.gridX <= 85 && player.gridY <= 266 && player.gridY > 265)) {
                    game.tryUnlockingAchievement("INTO_THE_WILD");
                }

                if(player.gridX <= 85 && player.gridY <= 293 && player.gridY > 292) {
                    game.tryUnlockingAchievement("AT_WORLDS_END");
                }

                if(player.gridX <= 85 && player.gridY <= 100 && player.gridY > 99) {
                    game.tryUnlockingAchievement("NO_MANS_LAND");
                }

                if(player.gridX <= 85 && player.gridY <= 51 && player.gridY > 50) {
                    game.tryUnlockingAchievement("HOT_SPOT");
                }

                if(player.gridX <= 27 && player.gridY <= 123 && player.gridY > 112) {
                    game.tryUnlockingAchievement("TOMB_RAIDER");
                }

                game.updatePlayerCheckpoint();

                if(!player.isDead) {
                    game.audioManager.updateMusic();
                }
            },

            // onStopPathing: set selectedCellVisible = false.
            onStopPathingPre: function(x, y) {
                game.selectedCellVisible = false;
            },

            // onStopPathing: loot, doors, npc talk, chest.
            onStopPathingExtra: function(x, y) {
                _handlePlayerStopPathing(game, player, x, y);
            },

            // onRequestPath: ignore only the target (simpler than non-player).
            requestPathIgnored: function() {
                var extra = [];
                if(player.hasTarget()) {
                    extra.push(player.target);
                }
                return extra;
            },

            // onDeath: stop blinking before shared death logic.
            onDeathPre: function() {
                player.stopBlinking();
            },

            // onDeath animation complete: null player ref, disable client.
            onDeathAnimDone: function() {
                game.player = null;
                game.client.disable();

                setTimeout(function() {
                    game.playerdeath_callback();
                }, 1000);
            },

            // onDeath: fade music and play death sound.
            onDeathPost: function() {
                game.audioManager.fadeOutCurrentMusic();
                game.audioManager.playSound("death");
            }
        });

        // ── Player-only events (not shared with other characters) ────

        player.onStartPathing(function(path) {
            var i = path.length - 1,
                x = path[i][0],
                y = path[i][1];

            if(player.isMovingToLoot()) {
                player.isLootMoving = false;
            }
            else if(!player.isAttacking()) {
                game.client.sendMove(x, y);
            }

            // Target cursor position
            game.selectedX = x;
            game.selectedY = y;
            game.selectedCellVisible = true;

            if(game.renderer.mobile || game.renderer.tablet) {
                game.drawTarget = true;
                game.clearTarget = true;
                game.renderer.targetRect = game.renderer.getTargetBoundingRect();
                game.checkOtherDirtyRects(game.renderer.targetRect, null, game.selectedX, game.selectedY);
            }
        });

        player.onCheckAggro(function() {
            game.forEachMob(function(mob) {
                if(mob.isAggressive && !mob.isAttacking() && player.isNear(mob, mob.aggroRange)) {
                    player.aggro(mob);
                }
            });
        });

        player.onAggro(function(mob) {
            if(!mob.isWaitingToAttack(player) && !player.isAttackedBy(mob)) {
                player.log_info("Aggroed by " + mob.id + " at (" + player.gridX + ", " + player.gridY + ")");
                game.client.sendAggro(mob);
                mob.waitToAttack(player);
            }
        });

        player.onArmorLoot(function(armorName) {
            player.switchArmor(game.sprites[armorName]);
        });

        player.onSwitchItem(function() {
            game.storage.savePlayer(game.renderer.getPlayerImage(),
                                    player.getArmorName(),
                                    player.getWeaponName());
            if(game.equipment_callback) {
                game.equipment_callback();
            }
        });

        player.onInvincible(function() {
            game.invincible_callback();
            player.switchArmor(game.sprites["firefox"]);
        });
    }

    // ====================================================================
    // Player onStopPathing: loot + door + npc/chest logic
    // ====================================================================

    function _handlePlayerStopPathing(game, player, x, y) {
        // ── Loot ─────────────────────────────────────────────────────
        if(game.isItemAt(x, y)) {
            var item = game.getItemAt(x, y);

            try {
                player.loot(item);
                game.client.sendLoot(item); // Notify the server that this item has been looted
                game.removeItem(item);
                game.showNotification(item.getLootMessage());

                if(item.type === "armor") {
                    game.tryUnlockingAchievement("FAT_LOOT");
                }

                if(item.type === "weapon") {
                    game.tryUnlockingAchievement("A_TRUE_WARRIOR");
                }

                if(item.kind === Types.Entities.CAKE) {
                    game.tryUnlockingAchievement("FOR_SCIENCE");
                }

                if(item.kind === Types.Entities.FIREPOTION) {
                    game.tryUnlockingAchievement("FOXY");
                    game.audioManager.playSound("firefox");
                }

                if(Types.isHealingItem(item.kind)) {
                    game.audioManager.playSound("heal");
                } else {
                    game.audioManager.playSound("loot");
                }

                if(item.wasDropped && !_(item.playersInvolved).include(game.playerId)) {
                    game.tryUnlockingAchievement("NINJA_LOOT");
                }
            } catch(e) {
                if(e instanceof Exceptions.LootException) {
                    game.showNotification(e.message);
                    game.audioManager.playSound("noloot");
                } else {
                    throw e;
                }
            }
        }

        // ── Door ─────────────────────────────────────────────────────
        if(!player.hasTarget() && game.map.isDoor(x, y)) {
            var dest = game.map.getDoorDestination(x, y);

            player.setGridPosition(dest.x, dest.y);
            player.nextGridX = dest.x;
            player.nextGridY = dest.y;
            player.turnTo(dest.orientation);
            game.client.sendTeleport(dest.x, dest.y);

            if(game.renderer.mobile && dest.cameraX && dest.cameraY) {
                game.camera.setGridPosition(dest.cameraX, dest.cameraY);
                game.resetZone();
            } else {
                if(dest.portal) {
                    game.assignBubbleTo(player);
                } else {
                    game.camera.focusEntity(player);
                    game.resetZone();
                }
            }

            if(_.size(player.attackers) > 0) {
                setTimeout(function() { game.tryUnlockingAchievement("COWARD"); }, 500);
            }
            player.forEachAttacker(function(attacker) {
                attacker.disengage();
                attacker.idle();
            });

            game.updatePlateauMode();

            game.checkUndergroundAchievement();

            if(game.renderer.mobile || game.renderer.tablet) {
                // When rendering with dirty rects, clear the whole screen when entering a door.
                game.renderer.clearScreen(game.renderer.context);
            }

            if(dest.portal) {
                game.audioManager.playSound("teleport");
            }

            if(!player.isDead) {
                game.audioManager.updateMusic();
            }
        }

        // ── NPC / Chest ──────────────────────────────────────────────
        if(player.target instanceof Npc) {
            game.makeNpcTalk(player.target);
        } else if(player.target instanceof Chest) {
            game.client.sendOpen(player.target);
            game.audioManager.playSound("chest");
        }
    }

    // ====================================================================
    // Spawn handlers (items, chests, characters)
    // ====================================================================

    function _registerSpawnHandlers(game) {
        var client = game.client;

        client.onSpawnItem(function(item, x, y) {
            log.info("Spawned " + Types.getKindAsString(item.kind) + " (" + item.id + ") at " + x + ", " + y);
            game.addItem(item, x, y);
        });

        client.onSpawnChest(function(chest, x, y) {
            log.info("Spawned chest (" + chest.id + ") at " + x + ", " + y);
            chest.setSprite(game.sprites[chest.getSpriteName()]);
            chest.setGridPosition(x, y);
            chest.setAnimation("idle_down", 150);
            game.addEntity(chest, x, y);

            chest.onOpen(function() {
                chest.stopBlinking();
                chest.setSprite(game.sprites["death"]);
                chest.setAnimation("death", 120, 1, function() {
                    log.info(chest.id + " was removed");
                    game.removeEntity(chest);
                    game.removeFromRenderingGrid(chest, chest.gridX, chest.gridY);
                    game.previousClickPosition = {};
                });
            });
        });

        client.onSpawnCharacter(function(entity, x, y, orientation, targetId) {
            if(!game.entityIdExists(entity.id)) {
                try {
                    if(entity.id !== game.playerId) {
                        entity.setSprite(game.sprites[entity.getSpriteName()]);
                        entity.setGridPosition(x, y);
                        entity.setOrientation(orientation);
                        entity.idle();

                        game.addEntity(entity);

                        log.debug("Spawned " + Types.getKindAsString(entity.kind) + " (" + entity.id + ") at " + entity.gridX + ", " + entity.gridY);

                        if(entity instanceof Character) {
                            // Use the shared event binder for non-player characters.
                            EntityBinders.bindCharacterEvents(entity, game, {
                                isPlayer: false,
                                stepGuard: function() { return !entity.isDying; },
                                stopPathGuard: function() { return !entity.isDying; }
                            });

                            if(entity instanceof Mob) {
                                if(targetId) {
                                    var player = game.getEntityById(targetId);
                                    if(player) {
                                        game.createAttackLink(entity, player);
                                    }
                                }
                            }
                        }
                    }
                }
                catch(e) {
                    log.error(e);
                }
            } else {
                log.debug("Character " + entity.id + " already exists. Don't respawn.");
            }
        });
    }

    // ====================================================================
    // Entity lifecycle handlers (despawn, move, destroy, blink, teleport)
    // ====================================================================

    function _registerEntityHandlers(game) {
        var client = game.client;

        client.onDespawnEntity(function(entityId) {
            var entity = game.getEntityById(entityId);

            if(entity) {
                log.info("Despawning " + Types.getKindAsString(entity.kind) + " (" + entity.id + ")");

                if(entity.gridX === game.previousClickPosition.x
                && entity.gridY === game.previousClickPosition.y) {
                    game.previousClickPosition = {};
                }

                if(entity instanceof Item) {
                    game.removeItem(entity);
                } else if(entity instanceof Character) {
                    entity.forEachAttacker(function(attacker) {
                        if(attacker.canReachTarget()) {
                            attacker.hit();
                        }
                    });
                    entity.die();
                } else if(entity instanceof Chest) {
                    entity.open();
                }

                entity.clean();
            }
        });

        client.onItemBlink(function(id) {
            var item = game.getEntityById(id);

            if(item) {
                item.blink(150);
            }
        });

        client.onEntityMove(function(id, x, y) {
            var entity = null;

            if(id !== game.playerId) {
                entity = game.getEntityById(id);

                if(entity) {
                    if(game.player.isAttackedBy(entity)) {
                        game.tryUnlockingAchievement("COWARD");
                    }
                    entity.disengage();
                    entity.idle();
                    game.makeCharacterGoTo(entity, x, y);
                }
            }
        });

        client.onEntityDestroy(function(id) {
            var entity = game.getEntityById(id);
            if(entity) {
                if(entity instanceof Item) {
                    game.removeItem(entity);
                } else {
                    game.removeEntity(entity);
                }
                log.debug("Entity was destroyed: " + entity.id);
            }
        });

        client.onPlayerMoveToItem(function(playerId, itemId) {
            var player, item;

            if(playerId !== game.playerId) {
                player = game.getEntityById(playerId);
                item = game.getEntityById(itemId);

                if(player && item) {
                    game.makeCharacterGoTo(player, item.gridX, item.gridY);
                }
            }
        });

        client.onPlayerTeleport(function(id, x, y) {
            var entity = null,
                currentOrientation;

            if(id !== game.playerId) {
                entity = game.getEntityById(id);

                if(entity) {
                    currentOrientation = entity.orientation;

                    game.makeCharacterTeleportTo(entity, x, y);
                    entity.setOrientation(currentOrientation);

                    entity.forEachAttacker(function(attacker) {
                        attacker.disengage();
                        attacker.idle();
                        attacker.stop();
                    });
                }
            }
        });
    }

    // ====================================================================
    // Combat handlers (attack, damage, kill, health)
    // ====================================================================

    function _registerCombatHandlers(game) {
        var client = game.client;

        client.onEntityAttack(function(attackerId, targetId) {
            var attacker = game.getEntityById(attackerId),
                target = game.getEntityById(targetId);

            if(attacker && target && attacker.id !== game.playerId) {
                log.debug(attacker.id + " attacks " + target.id);

                if(attacker && target instanceof Player && target.id !== game.playerId && target.target && target.target.id === attacker.id && attacker.getDistanceToEntity(target) < 3) {
                    setTimeout(function() {
                        game.createAttackLink(attacker, target);
                    }, 200); // delay to prevent other players attacking mobs from ending up on the same tile as they walk towards each other.
                } else {
                    game.createAttackLink(attacker, target);
                }
            }
        });

        client.onPlayerDamageMob(function(mobId, points) {
            var mob = game.getEntityById(mobId);
            if(mob && points) {
                game.infoManager.addDamageInfo(points, mob.x, mob.y - 15, "inflicted");
            }
        });

        client.onPlayerKillMob(function(kind) {
            var mobName = Types.getKindAsString(kind);

            if(mobName === 'skeleton2') {
                mobName = 'greater skeleton';
            }

            if(mobName === 'eye') {
                mobName = 'evil eye';
            }

            if(mobName === 'deathknight') {
                mobName = 'death knight';
            }

            if(mobName === 'boss') {
                game.showNotification("You killed the skeleton king");
            } else {
                if(_.include(['a', 'e', 'i', 'o', 'u'], mobName[0])) {
                    game.showNotification("You killed an " + mobName);
                } else {
                    game.showNotification("You killed a " + mobName);
                }
            }

            game.storage.incrementTotalKills();
            game.tryUnlockingAchievement("HUNTER");

            if(kind === Types.Entities.RAT) {
                game.storage.incrementRatCount();
                game.tryUnlockingAchievement("ANGRY_RATS");
            }

            if(kind === Types.Entities.SKELETON || kind === Types.Entities.SKELETON2) {
                game.storage.incrementSkeletonCount();
                game.tryUnlockingAchievement("SKULL_COLLECTOR");
            }

            if(kind === Types.Entities.BOSS) {
                game.tryUnlockingAchievement("HERO");
            }
        });

        client.onPlayerChangeHealth(function(points, isRegen) {
            var player = game.player,
                diff,
                isHurt;

            if(player && !player.isDead && !player.invincible) {
                isHurt = points <= player.hitPoints;
                diff = points - player.hitPoints;
                player.hitPoints = points;

                if(player.hitPoints <= 0) {
                    player.die();
                }
                if(isHurt) {
                    player.hurt();
                    game.infoManager.addDamageInfo(diff, player.x, player.y - 15, "received");
                    game.audioManager.playSound("hurt");
                    game.storage.addDamage(-diff);
                    game.tryUnlockingAchievement("MEATSHIELD");
                    if(game.playerhurt_callback) {
                        game.playerhurt_callback();
                    }
                } else if(!isRegen) {
                    game.infoManager.addDamageInfo("+" + diff, player.x, player.y - 15, "healed");
                }
                game.updateBars();
            }
        });

        client.onPlayerChangeMaxHitPoints(function(hp) {
            game.player.maxHitPoints = hp;
            game.player.hitPoints = hp;
            game.updateBars();
        });

        client.onPlayerEquipItem(function(playerId, itemKind) {
            var player = game.getEntityById(playerId),
                itemName = Types.getKindAsString(itemKind);

            if(player) {
                if(Types.isArmor(itemKind)) {
                    player.setSprite(game.sprites[itemName]);
                } else if(Types.isWeapon(itemKind)) {
                    player.setWeaponName(itemName);
                }
            }
        });
    }

    // ====================================================================
    // Miscellaneous handlers (drop, chat, population, disconnect)
    // ====================================================================

    function _registerMiscHandlers(game) {
        var client = game.client;

        client.onDropItem(function(item, mobId) {
            var pos = game.getDeadMobPosition(mobId);

            if(pos) {
                game.addItem(item, pos.x, pos.y);
                game.updateCursor();
            }
        });

        client.onChatMessage(function(entityId, message) {
            var entity = game.getEntityById(entityId);
            game.createBubble(entityId, message);
            game.assignBubbleTo(entity);
            game.audioManager.playSound("chat");
        });

        client.onPopulationChange(function(worldPlayers, totalPlayers) {
            if(game.nbplayers_callback) {
                game.nbplayers_callback(worldPlayers, totalPlayers);
            }
        });

        client.onDisconnected(function(message) {
            if(game.player) {
                game.player.die();
            }
            if(game.disconnect_callback) {
                game.disconnect_callback(message);
            }
        });
    }

    return {
        registerMessageHandlers: registerMessageHandlers
    };
});
