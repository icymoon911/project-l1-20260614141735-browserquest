
define(['charevents', 'character', 'player', 'mob', 'chest', 'npc', 'item', 'exceptions',
        '../../shared/js/gametypes'],
function(CharacterEvents, Character, Player, Mob, Chest, Npc, Item, Exceptions) {

    /**
     * Handlers - Registers all GameClient message callbacks.
     *
     * Game.connect() calls Handlers.register(game, started_callback) once the
     * GameClient has been created.  Every onXxx handler is set up here, keeping
     * game.js free of deep callback nesting.
     */
    var Handlers = {

        /**
         * Master entry point: registers every client handler and the welcome bootstrap.
         */
        register: function(game, started_callback) {
            this._registerEntityList(game);
            this._registerSpawnItem(game);
            this._registerSpawnChest(game);
            this._registerSpawnCharacter(game);
            this._registerDespawnEntity(game);
            this._registerItemBlink(game);
            this._registerEntityMove(game);
            this._registerEntityDestroy(game);
            this._registerPlayerMoveToItem(game);
            this._registerEntityAttack(game);
            this._registerPlayerDamageMob(game);
            this._registerPlayerKillMob(game);
            this._registerPlayerChangeHealth(game);
            this._registerPlayerChangeMaxHitPoints(game);
            this._registerPlayerEquipItem(game);
            this._registerPlayerTeleport(game);
            this._registerDropItem(game);
            this._registerChatMessage(game);
            this._registerPopulationChange(game);
            this._registerDisconnected(game);
            this._registerWelcome(game, started_callback);
        },

        // ── Helpers ──────────────────────────────────────────────────

        /**
         * Bind player-specific events that only apply to the local player.
         * Called from inside the onWelcome handler once the player entity is ready.
         */
        _bindPlayerEvents: function(game) {
            var player = game.player;

            // onStartPathing – notify server of movement, update cursor target
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

            // onCheckAggro – scan for aggressive mobs nearby
            player.onCheckAggro(function() {
                game.forEachMob(function(mob) {
                    if(mob.isAggressive && !mob.isAttacking() && player.isNear(mob, mob.aggroRange)) {
                        player.aggro(mob);
                    }
                });
            });

            // onAggro – respond to mob aggro
            player.onAggro(function(mob) {
                if(!mob.isWaitingToAttack(player) && !player.isAttackedBy(mob)) {
                    player.log_info("Aggroed by " + mob.id + " at (" + player.gridX + ", " + player.gridY + ")");
                    game.client.sendAggro(mob);
                    mob.waitToAttack(player);
                }
            });

            // Bind shared character events (onBeforeStep, onStep, onStopPathing, etc.)
            // The onStopPathingPre callback contains all the player-specific stop-pathing
            // business logic: looting, door traversal, NPC talk, chest opening.
            CharacterEvents.bindCharacterEvents(player, game, {
                isPlayer: true,
                onStopPathingPre: function(x, y) {
                    game.selectedCellVisible = false;

                    // ── Looting ──────────────────────────────────
                    if(game.isItemAt(x, y)) {
                        var item = game.getItemAt(x, y);

                        try {
                            player.loot(item);
                            game.client.sendLoot(item);
                            game.removeItem(item);
                            game.showNotification(item.getLootMessage());

                            // Achievement triggers for looted item
                            game.achievementManager.onItemLooted(item);

                            if(item.kind === Types.Entities.FIREPOTION) {
                                game.audioManager.playSound("firefox");
                            }

                            if(Types.isHealingItem(item.kind)) {
                                game.audioManager.playSound("heal");
                            } else {
                                game.audioManager.playSound("loot");
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

                    // ── Door traversal ───────────────────────────
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

                        // Achievement triggers for door traversal (COWARD, UNDERGROUND)
                        game.achievementManager.onPlayerEnterDoor();

                        player.forEachAttacker(function(attacker) {
                            attacker.disengage();
                            attacker.idle();
                        });

                        game.updatePlateauMode();

                        if(game.renderer.mobile || game.renderer.tablet) {
                            game.renderer.clearScreen(game.renderer.context);
                        }

                        if(dest.portal) {
                            game.audioManager.playSound("teleport");
                        }

                        if(!player.isDead) {
                            game.audioManager.updateMusic();
                        }
                    }

                    // ── NPC talk / Chest open ────────────────────
                    if(player.target instanceof Npc) {
                        game.makeNpcTalk(player.target);
                    } else if(player.target instanceof Chest) {
                        game.client.sendOpen(player.target);
                        game.audioManager.playSound("chest");
                    }
                }
            });

            // onArmorLoot – switch armor sprite
            player.onArmorLoot(function(armorName) {
                player.switchArmor(game.sprites[armorName]);
            });

            // onSwitchItem – persist equipment to storage
            player.onSwitchItem(function() {
                game.storage.savePlayer(game.renderer.getPlayerImage(),
                                        player.getArmorName(),
                                        player.getWeaponName());
                if(game.equipment_callback) {
                    game.equipment_callback();
                }
            });

            // onInvincible – toggle invincibility UI
            player.onInvincible(function() {
                game.invincible_callback();
                player.switchArmor(game.sprites["firefox"]);
            });
        },

        // ── Individual handler registrations ─────────────────────────

        _registerEntityList: function(game) {
            game.client.onEntityList(function(list) {
                var entityIds = _.pluck(game.entities, 'id'),
                    knownIds = _.intersection(entityIds, list),
                    newIds = _.difference(list, knownIds);

                game.obsoleteEntities = _.reject(game.entities, function(entity) {
                    return _.include(knownIds, entity.id) || entity.id === game.player.id;
                });

                game.removeObsoleteEntities();

                if(_.size(newIds) > 0) {
                    game.client.sendWho(newIds);
                }
            });
        },

        _registerSpawnItem: function(game) {
            game.client.onSpawnItem(function(item, x, y) {
                log.info("Spawned " + Types.getKindAsString(item.kind) + " (" + item.id + ") at " + x + ", " + y);
                game.addItem(item, x, y);
            });
        },

        _registerSpawnChest: function(game) {
            game.client.onSpawnChest(function(chest, x, y) {
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
        },

        _registerSpawnCharacter: function(game) {
            game.client.onSpawnCharacter(function(entity, x, y, orientation, targetId) {
                if(!game.entityIdExists(entity.id)) {
                    try {
                        if(entity.id !== game.playerId) {
                            entity.setSprite(game.sprites[entity.getSpriteName()]);
                            entity.setGridPosition(x, y);
                            entity.setOrientation(orientation);
                            entity.idle();

                            game.addEntity(entity);

                            log.debug("Spawned " + Types.getKindAsString(entity.kind) +
                                      " (" + entity.id + ") at " + entity.gridX + ", " + entity.gridY);

                            if(entity instanceof Character) {
                                // Bind shared character events for this non-player entity
                                CharacterEvents.bindCharacterEvents(entity, game, { isPlayer: false });

                                // Link mob to its target if specified
                                if(entity instanceof Mob) {
                                    if(targetId) {
                                        var target = game.getEntityById(targetId);
                                        if(target) {
                                            game.createAttackLink(entity, target);
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
        },

        _registerDespawnEntity: function(game) {
            game.client.onDespawnEntity(function(entityId) {
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
        },

        _registerItemBlink: function(game) {
            game.client.onItemBlink(function(id) {
                var item = game.getEntityById(id);
                if(item) {
                    item.blink(150);
                }
            });
        },

        _registerEntityMove: function(game) {
            game.client.onEntityMove(function(id, x, y) {
                if(id !== game.playerId) {
                    var entity = game.getEntityById(id);

                    if(entity) {
                        if(game.player.isAttackedBy(entity)) {
                            game.achievementManager.onPlayerEscape();
                        }
                        entity.disengage();
                        entity.idle();
                        game.makeCharacterGoTo(entity, x, y);
                    }
                }
            });
        },

        _registerEntityDestroy: function(game) {
            game.client.onEntityDestroy(function(id) {
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
        },

        _registerPlayerMoveToItem: function(game) {
            game.client.onPlayerMoveToItem(function(playerId, itemId) {
                if(playerId !== game.playerId) {
                    var player = game.getEntityById(playerId),
                        item = game.getEntityById(itemId);

                    if(player && item) {
                        game.makeCharacterGoTo(player, item.gridX, item.gridY);
                    }
                }
            });
        },

        _registerEntityAttack: function(game) {
            game.client.onEntityAttack(function(attackerId, targetId) {
                var attacker = game.getEntityById(attackerId),
                    target = game.getEntityById(targetId);

                if(attacker && target && attacker.id !== game.playerId) {
                    log.debug(attacker.id + " attacks " + target.id);

                    if(attacker && target instanceof Player && target.id !== game.playerId &&
                       target.target && target.target.id === attacker.id &&
                       attacker.getDistanceToEntity(target) < 3) {
                        setTimeout(function() {
                            game.createAttackLink(attacker, target);
                        }, 200);
                    } else {
                        game.createAttackLink(attacker, target);
                    }
                }
            });
        },

        _registerPlayerDamageMob: function(game) {
            game.client.onPlayerDamageMob(function(mobId, points) {
                var mob = game.getEntityById(mobId);
                if(mob && points) {
                    game.infoManager.addDamageInfo(points, mob.x, mob.y - 15, "inflicted");
                }
            });
        },

        _registerPlayerKillMob: function(game) {
            game.client.onPlayerKillMob(function(kind) {
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

                // Delegate storage increments and achievement triggers
                game.achievementManager.onMobKilled(kind);
            });
        },

        _registerPlayerChangeHealth: function(game) {
            game.client.onPlayerChangeHealth(function(points, isRegen) {
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
                        // Delegate storage increment and achievement check
                        game.achievementManager.onPlayerHurt(-diff);
                        if(game.playerhurt_callback) {
                            game.playerhurt_callback();
                        }
                    } else if(!isRegen) {
                        game.infoManager.addDamageInfo("+" + diff, player.x, player.y - 15, "healed");
                    }
                    game.updateBars();
                }
            });
        },

        _registerPlayerChangeMaxHitPoints: function(game) {
            game.client.onPlayerChangeMaxHitPoints(function(hp) {
                game.player.maxHitPoints = hp;
                game.player.hitPoints = hp;
                game.updateBars();
            });
        },

        _registerPlayerEquipItem: function(game) {
            game.client.onPlayerEquipItem(function(playerId, itemKind) {
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
        },

        _registerPlayerTeleport: function(game) {
            game.client.onPlayerTeleport(function(id, x, y) {
                if(id !== game.playerId) {
                    var entity = game.getEntityById(id);

                    if(entity) {
                        var currentOrientation = entity.orientation;

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
        },

        _registerDropItem: function(game) {
            game.client.onDropItem(function(item, mobId) {
                var pos = game.getDeadMobPosition(mobId);

                if(pos) {
                    game.addItem(item, pos.x, pos.y);
                    game.updateCursor();
                }
            });
        },

        _registerChatMessage: function(game) {
            game.client.onChatMessage(function(entityId, message) {
                var entity = game.getEntityById(entityId);
                game.createBubble(entityId, message);
                game.assignBubbleTo(entity);
                game.audioManager.playSound("chat");
            });
        },

        _registerPopulationChange: function(game) {
            game.client.onPopulationChange(function(worldPlayers, totalPlayers) {
                if(game.nbplayers_callback) {
                    game.nbplayers_callback(worldPlayers, totalPlayers);
                }
            });
        },

        _registerDisconnected: function(game) {
            game.client.onDisconnected(function(message) {
                if(game.player) {
                    game.player.die();
                }
                if(game.disconnect_callback) {
                    game.disconnect_callback(message);
                }
            });
        },

        _registerWelcome: function(game, started_callback) {
            game.client.onWelcome(function(id, name, x, y, hp) {
                log.info("Received player ID from server : " + id);
                game.player.id = id;
                game.playerId = id;
                game.player.name = name;
                game.player.setGridPosition(x, y);
                game.player.setMaxHitPoints(hp);

                game.updateBars();
                game.resetCamera();
                game.updatePlateauMode();
                game.audioManager.updateMusic();

                game.addEntity(game.player);
                game.player.dirtyRect = game.renderer.getEntityBoundingRect(game.player);

                // Achievement: check STILL_ALIVE after a short delay
                game.achievementManager.onPlayerWelcome();

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

                // Bind all player-specific events
                Handlers._bindPlayerEvents(game);

                game.gamestart_callback();

                if(game.hasNeverStarted) {
                    game.start();
                    started_callback();
                }
            });
        }
    };

    return Handlers;
});
