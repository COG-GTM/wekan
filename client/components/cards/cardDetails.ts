import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { Meteor } from 'meteor/meteor';
import { Tracker } from 'meteor/tracker';
import { ReactiveDict } from 'meteor/reactive-dict';
import { ReactiveCache } from '/imports/reactiveCache';
import { TAPi18n } from '/imports/i18n';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { ReactiveVar } from 'meteor/reactive-var';
import {
  DEPENDENCY_TYPES,
  DEPENDENCY_ICON_CHOICES,
  DEFAULT_DEPENDENCY_COLOR,
  DEFAULT_DEPENDENCY_ICON,
} from '/models/metadata/dependencies';
import { canArchiveCard } from '/client/lib/archivePermission';
import { isTextSelectionInsideCard } from '/client/lib/cardCloseGuard';

// Which dependency the icon picker should apply its choice to. The icon popup's
// own data context is the dependency row (not the source card), so we capture
// the source card + target id here when the picker is opened.
let editingDependencyTargetId: string | null = null;
// Dynamic source card model doc captured when the dependency icon picker opens.
let editingDependencyCard: any = null;
import {
  setupDatePicker,
  datePickerRendered,
  datePickerHelpers,
  datePickerEvents,
} from '/client/lib/datepicker';
import {
  formatDateTime,
  formatDate,
  formatTime,
  getISOWeek,
  isValidDate,
  isBefore,
  isAfter,
  isSame,
  add,
  subtract,
  startOf,
  endOf,
  format,
  parseDate,
  now,
  createDate,
  fromNow,
  calendar
} from '/imports/lib/dateUtils';
import Cards from '/models/cards';
import Boards from '/models/boards';
import Checklists from '/models/checklists';
import Integrations from '/models/integrations';
import Users from '/models/users';
import Lists from '/models/lists';
import CardComments from '/models/cardComments';
import { ALLOWED_COLORS } from '/config/const';
import { uniqBy } from '/imports/lib/collectionHelpers';
// userAvatar registers Blaze templates as a side effect; it has no exports.
import '../users/userAvatar';
import { Filter } from '/client/lib/filter';
import { BoardSwimlaneListCardDialog } from '/client/lib/dialogWithBoardSwimlaneListCard';
import { handleFileUpload } from './attachments';
import { InfiniteScrolling } from '/client/lib/infiniteScrolling';
import {
  getCurrentCardIdFromContext,
  getCurrentCardFromContext,
} from '/client/lib/currentCard';
import uploadProgressManager from '../../lib/uploadProgressManager';
import { CSSEvents } from '/client/lib/cssEvents';
import { UnsavedEdits } from '/client/lib/unsavedEdits';
import { EscapeActions } from '/client/lib/escapeActions';
import { MultiSelection } from '/client/lib/multiSelection';
import { Utils } from '/client/lib/utils';
import autosize from 'autosize';

// Id of the location currently being edited in the cardLocationsPopup; null
// when adding a new location.
const editingLocationId = new ReactiveVar<string | null>(null);

// Chinese datum conversions ("eviltransform" algorithm). Baidu Maps uses BD-09
// and Amap (Gaode) uses GCJ-02; both are offset from the WGS-84 coordinates
// Wekan stores, so a raw lat/lon would land a few hundred metres off. Convert on
// the way out (mapLinkFor) and back (parseMapLink). Coordinates outside mainland
// China use no offset, so every non-Chinese provider is unaffected.
const GCJ = (() => {
  const PI = Math.PI;
  const A = 6378245.0; // Krasovsky 1940 semi-major axis
  const EE = 0.00669342162296594323; // eccentricity squared
  const XPI = (PI * 3000.0) / 180.0;
  const outOfChina = (lat: number, lon: number) =>
    lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
  const tLat = (x: number, y: number) => {
    let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
    r += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3;
    r += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3;
    return r;
  };
  const tLon = (x: number, y: number) => {
    let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
    r += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3;
    r += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3;
    return r;
  };
  const wgs2gcj = (lat: number, lon: number) => {
    if (outOfChina(lat, lon)) return [lat, lon];
    let dLat = tLat(lon - 105, lat - 35);
    let dLon = tLon(lon - 105, lat - 35);
    const rad = (lat / 180) * PI;
    let magic = Math.sin(rad);
    magic = 1 - EE * magic * magic;
    const sq = Math.sqrt(magic);
    dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sq)) * PI);
    dLon = (dLon * 180) / ((A / sq) * Math.cos(rad) * PI);
    return [lat + dLat, lon + dLon];
  };
  // Approximate inverse by fixed-point iteration (converges to ~1e-9 deg).
  const gcj2wgs = (lat: number, lon: number) => {
    if (outOfChina(lat, lon)) return [lat, lon];
    let wLat = lat;
    let wLon = lon;
    for (let i = 0; i < 10; i++) {
      const [gLat, gLon] = wgs2gcj(wLat, wLon);
      const dLat = gLat - lat;
      const dLon = gLon - lon;
      if (Math.abs(dLat) < 1e-9 && Math.abs(dLon) < 1e-9) break;
      wLat -= dLat;
      wLon -= dLon;
    }
    return [wLat, wLon];
  };
  const gcj2bd = (lat: number, lon: number) => {
    const z = Math.sqrt(lon * lon + lat * lat) + 0.00002 * Math.sin(lat * XPI);
    const theta = Math.atan2(lat, lon) + 0.000003 * Math.cos(lon * XPI);
    return [z * Math.sin(theta) + 0.006, z * Math.cos(theta) + 0.0065];
  };
  const bd2gcj = (lat: number, lon: number) => {
    const x = lon - 0.0065;
    const y = lat - 0.006;
    const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * XPI);
    const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * XPI);
    return [z * Math.sin(theta), z * Math.cos(theta)];
  };
  return {
    wgs2gcj,
    gcj2wgs,
    wgs2bd: (lat: number, lon: number) => {
      if (outOfChina(lat, lon)) return [lat, lon];
      const [gLat, gLon] = wgs2gcj(lat, lon);
      return gcj2bd(gLat, gLon);
    },
    bd2wgs: (lat: number, lon: number) => {
      if (outOfChina(lat, lon)) return [lat, lon];
      const [gLat, gLon] = bd2gcj(lat, lon);
      return gcj2wgs(gLat, gLon);
    },
  };
})();

// Parse coordinates (and, when present, a place name / address) out of a map
// link from common providers, grouped by region:
//   USA:    Google Maps, Bing Maps, Apple Maps, Waze
//   Europe: OpenStreetMap, HERE WeGo, Yandex Maps, Mapy.cz, 2GIS
//   Asia:   Baidu Maps, Amap (Gaode)
// plus generic `?q=lat,lon` / `?ll=lat,lon` links. Returns whatever it can find
// as { latitude, longitude, name, address }.
function parseMapLink(url: any) {
  const result: ParsedMapLink = {};
  if (!url) return result;
  const s = String(url).trim();

  let lat: number | undefined;
  let lon: number | undefined;
  const setCoords = (la: any, lo: any) => {
    if (lat !== undefined) return;
    const a = parseFloat(la);
    const o = parseFloat(lo);
    if (!isNaN(a) && !isNaN(o) && Math.abs(a) <= 90 && Math.abs(o) <= 180) {
      lat = a;
      lon = o;
    }
  };

  const N = '(-?\\d+(?:\\.\\d+)?)';
  // Coordinates are matched against a normalized copy where percent-encoded
  // commas/slashes are decoded, since copied URLs often arrive as `%2C`/`%2F`
  // (e.g. Waze `ll=45.69%2C-120.81`, Yandex `ll=37.6%2C55.7`).
  const sd = s.replace(/%2c/gi, ',').replace(/%2f/gi, '/');
  let m;
  // Provider-specific forms that use lon,lat order must be handled before the
  // generic lat,lon patterns below, since setCoords keeps only the first match.
  // Yandex Maps: ?ll=<lon>,<lat> or ?pt=<lon>,<lat>[,style]
  if (/yandex\./i.test(sd) && (m = sd.match(new RegExp(`[?&](?:ll|pt)=${N},${N}`)))) setCoords(m[2], m[1]);
  // Mapy.cz: ?x=<lon>&y=<lat>
  if (/mapy\./i.test(sd) && (m = sd.match(new RegExp(`[?&]y=${N}`)))) {
    const mx = sd.match(new RegExp(`[?&]x=${N}`));
    if (mx) setCoords(m[1], mx[1]);
  }
  // 2GIS: /geo/<lon>,<lat> or ?m=<lon>,<lat>[/zoom]
  if (/2gis\./i.test(sd) && (m = sd.match(new RegExp(`(?:/geo/|[?&]m=)${N},${N}`)))) setCoords(m[2], m[1]);
  // Amap (Gaode): ?position=<lon>,<lat> in GCJ-02 datum -> WGS-84.
  if (/amap\./i.test(sd) && (m = sd.match(new RegExp(`[?&]position=${N},${N}`)))) {
    const [wLat, wLon] = GCJ.gcj2wgs(parseFloat(m[2]), parseFloat(m[1]));
    setCoords(wLat, wLon);
  }
  // Baidu Maps: ?location=<lat>,<lon> in BD-09 datum -> WGS-84.
  if (/baidu\./i.test(sd) && (m = sd.match(new RegExp(`[?&]location=${N},${N}`)))) {
    const [wLat, wLon] = GCJ.bd2wgs(parseFloat(m[1]), parseFloat(m[2]));
    setCoords(wLat, wLon);
  }
  // HERE WeGo: ?map=<lat>,<lon>,<zoom> or share path /l/<lat>,<lon>
  if (/here\./i.test(sd) && (m = sd.match(new RegExp(`(?:[?&]map=|/l/)${N},${N}`)))) setCoords(m[1], m[2]);
  // Google Maps place marker in the data part: !3d<lat>!4d<lon> (most precise).
  if ((m = sd.match(new RegExp(`!3d${N}!4d${N}`)))) setCoords(m[1], m[2]);
  // Google Maps view/place: @<lat>,<lon>
  if ((m = sd.match(new RegExp(`@${N},${N}`)))) setCoords(m[1], m[2]);
  // OpenStreetMap marker: ?mlat=..&mlon=..
  if ((m = sd.match(new RegExp(`[?&#]mlat=${N}`)))) {
    const mlon = sd.match(new RegExp(`[?&#]mlon=${N}`));
    if (mlon) setCoords(m[1], mlon[1]);
  }
  // OpenStreetMap map hash: #map=z/lat/lon
  if ((m = sd.match(new RegExp(`[#&]map=\\d+(?:\\.\\d+)?/${N}/${N}`)))) setCoords(m[1], m[2]);
  // Bing Maps: cp=lat~lon
  if ((m = sd.match(new RegExp(`[?&]cp=${N}~${N}`)))) setCoords(m[1], m[2]);
  // Apple Maps / Waze and generic ll=lat,lon
  if ((m = sd.match(new RegExp(`[?&]ll=${N},${N}`)))) setCoords(m[1], m[2]);
  // Generic q=lat,lon (Google/Apple query form)
  if ((m = sd.match(new RegExp(`[?&]q=${N},${N}`)))) setCoords(m[1], m[2]);
  // Generic center=lat,lon
  if ((m = sd.match(new RegExp(`[?&]center=${N},${N}`)))) setCoords(m[1], m[2]);

  if (lat !== undefined) {
    result.latitude = lat;
    result.longitude = lon;
  }

  const decode = (raw: string) => {
    try {
      return decodeURIComponent(raw.replace(/\+/g, ' ')).trim();
    } catch (e) {
      return raw.replace(/\+/g, ' ').trim();
    }
  };
  const isCoordText = (t: string) => /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(t);

  // Place name from Google Maps /place/<Name>/
  if ((m = s.match(/\/place\/([^/@?]+)/))) {
    const name = decode(m[1]);
    if (name && !isCoordText(name)) result.name = name;
  }
  // Address from a textual q=/query=/destination= parameter.
  if ((m = s.match(/[?&](?:q|query|destination)=([^&]+)/))) {
    const q = decode(m[1]);
    if (q && !isCoordText(q)) result.address = q;
  }

  return result;
}

// Build an "open in map" link for the given provider and coordinates. Mirrors
// the providers offered in the location popup's "Open map links at" selector,
// grouped by region (USA, Europe, Asia). Note that several non-US providers
// expect the coordinates in lon,lat order rather than lat,lon.
function mapLinkFor(provider: string, lat: any, lon: any) {
  switch (provider) {
    // --- USA ---
    case 'google':
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    case 'bing':
      return `https://www.bing.com/maps?cp=${lat}~${lon}&lvl=16`;
    case 'apple':
      return `https://maps.apple.com/?ll=${lat},${lon}`;
    case 'waze':
      return `https://waze.com/ul?ll=${lat},${lon}`;
    // --- Europe ---
    case 'here':
      return `https://wego.here.com/?map=${lat},${lon},16`;
    case 'yandex':
      return `https://yandex.com/maps/?ll=${lon},${lat}&z=16`;
    case 'mapy':
      return `https://mapy.cz/zakladni?x=${lon}&y=${lat}&z=16`;
    case '2gis':
      return `https://2gis.ru/geo/${lon},${lat}`;
    // --- Asia (coordinates converted from WGS-84 into the local datum) ---
    case 'baidu': {
      const [bLat, bLon] = GCJ.wgs2bd(parseFloat(lat), parseFloat(lon));
      return `https://api.map.baidu.com/marker?location=${bLat},${bLon}&output=html`;
    }
    case 'amap': {
      const [gLat, gLon] = GCJ.wgs2gcj(parseFloat(lat), parseFloat(lon));
      return `https://uri.amap.com/marker?position=${gLon},${gLat}`;
    }
    case 'openstreetmap':
    default:
      return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
  }
}

// SubsManager removed for Meteor 3 migration
const { calculateIndexData } = Utils;

function getCardId() {
  return getCurrentCardIdFromContext();
}

function getBoardBodyInstance(tpl?: any) {
  const boardBodyEl = document.querySelector('.board-body');
  if (boardBodyEl) {
    const view = Blaze.getView(boardBodyEl as HTMLElement);
    // boardBody instance carries custom reactive state (showOverlay etc.).
    if (view && view.templateInstance) return view.templateInstance() as any;
  }
  return null;
}

function getCardDetailsElement(cardId: any) {
  if (!cardId) {
    return null;
  }

  const cardDetailsElements = document.querySelectorAll('.js-card-details');
  for (const element of cardDetailsElements) {
    if ((Blaze.getData(element as HTMLElement) as any)?._id === cardId) {
      return element;
    }
  }

  return null;
}

Template.cardDetails.onCreated(function (this: CardDetailsInstance) {
  this.currentBoard = Utils.getCurrentBoard();
  this.isLoaded = new ReactiveVar(false);
  this.infiniteScrolling = new InfiniteScrolling();

  const boardBody = getBoardBodyInstance();
  if (boardBody !== null) {
    // Only show overlay in mobile mode, not in desktop mode
    const isMobile = Utils.getMobileMode();
    if (isMobile) {
      boardBody.showOverlay.set(true);
    }
    boardBody.mouseHasEnterCardDetails = false;
  }

  this.calculateNextPeak = () => {
    const cardElement = this.find('.js-card-details');
    if (cardElement) {
      const altitude = cardElement.scrollHeight;
      this.infiniteScrolling.setNextPeak(altitude);
    }
  };

  this.reachNextPeak = () => {
    const activitiesEl = this.find('.activities');
    if (activitiesEl) {
      const view = Blaze.getView(activitiesEl);
      if (view && view.templateInstance) {
        // activities template instance exposes a custom loadNextPage method.
        const activitiesTpl: any = view.templateInstance();
        if (activitiesTpl && activitiesTpl.loadNextPage) {
          activitiesTpl.loadNextPage();
        }
      }
    }
  };

  Meteor.subscribe('unsaved-edits');

  // Surface legacy CollectionFS attachments for the current board so they show
  // up in the card's attachment gallery and can be read in place (without
  // migrating them to Meteor-Files first).
  this.autorun(() => {
    const board = Utils.getCurrentBoard();
    if (board && board._id) {
      Meteor.subscribe('legacyBoardAttachments', board._id);
    }
  });
});

Template.cardDetails.onRendered(function (this: CardDetailsInstance) {
  // A reactive re-render (e.g. a card moving between the inline swimlane render
  // and the draggable openCards popup) can create and then remove this instance
  // within the same flush. If our DOM range is already gone, calling this.$()
  // below throws "Can't select in removed DomRange", so bail out early.
  // Blaze.View's isDestroyed flag is not in the ambient view type.
  if (this.view && (this.view as any).isDestroyed) return;
  this.calculateNextPeak();
  if (Meteor.settings.public.CARD_OPENED_WEBHOOK_ENABLED) {
    // Send Webhook but not create Activities records ---
    const card = Template.currentData();
    const userId = Meteor.userId();
    const params = {
      userId,
      cardId: card._id,
      boardId: card.boardId,
      listId: card.listId,
      user: ReactiveCache.getCurrentUser().username,
      url: '',
    };

    const integrations = ReactiveCache.getIntegrations({
      boardId: { $in: [card.boardId, (Integrations as any).Const.GLOBAL_WEBHOOK_ID] },
      enabled: true,
      activities: { $in: ['CardDetailsRendered', 'all'] },
    });

    if (integrations.length > 0) {
      integrations.forEach((integration: any) => {
        Meteor.call(
          'outgoingWebhooks',
          integration,
          'CardSelected',
          params,
          () => { },
        );
      });
    }
    //-------------
  }

  const $checklistsDom = this.$('.card-checklist-items');

  $checklistsDom.sortable({
    tolerance: 'pointer',
    helper: 'clone',
    handle: '.checklist-title',
    items: '.js-checklist',
    placeholder: 'checklist placeholder',
    distance: 7,
    start(evt, ui) {
      ui.placeholder.height(ui.helper.height()!);
      EscapeActions.clickExecute(evt.target, 'inlinedForm');
    },
    stop(evt, ui) {
      let prevChecklist: any = ui.item.prev('.js-checklist').get(0);
      if (prevChecklist) {
        prevChecklist = (Blaze.getData(prevChecklist) as any).checklist;
      }
      let nextChecklist: any = ui.item.next('.js-checklist').get(0);
      if (nextChecklist) {
        nextChecklist = (Blaze.getData(nextChecklist) as any).checklist;
      }
      const sortIndex = calculateIndexData(prevChecklist, nextChecklist, 1);

      $checklistsDom.sortable('cancel');
      const checklist = (Blaze.getData(ui.item.get(0) as HTMLElement) as any).checklist;

      Checklists.update(checklist._id, {
        $set: {
          sort: sortIndex.base,
        },
      });
    },
  });

  const $subtasksDom = this.$('.card-subtasks-items');

  $subtasksDom.sortable({
    tolerance: 'pointer',
    helper: 'clone',
    handle: '.subtask-title',
    items: '.js-subtasks',
    placeholder: 'subtasks placeholder',
    distance: 7,
    start(evt, ui) {
      ui.placeholder.height(ui.helper.height()!);
      EscapeActions.executeUpTo('popup-close');
    },
    stop(evt, ui) {
      let prevSubtask: any = ui.item.prev('.js-subtasks').get(0);
      if (prevSubtask) {
        prevSubtask = (Blaze.getData(prevSubtask) as any).subtask;
      }
      let nextSubtask: any = ui.item.next('.js-subtasks').get(0);
      if (nextSubtask) {
        nextSubtask = (Blaze.getData(nextSubtask) as any).subtask;
      }
      const sortIndex = calculateIndexData(prevSubtask, nextSubtask, 1);

      $subtasksDom.sortable('cancel');
      const subtask = (Blaze.getData(ui.item.get(0) as HTMLElement) as any).subtask;

      Cards.updateAsync(subtask._id, {
        $set: {
          sort: sortIndex.base,
        },
      });
    },
  });

  function userIsMember() {
    return ReactiveCache.getCurrentUser()?.isBoardMember();
  }

  // Disable sorting if the current user is not a board member
  this.autorun(() => {
    const disabled = !userIsMember();
    if (
      $checklistsDom.data('uiSortable') ||
      $checklistsDom.data('sortable')
    ) {
      $checklistsDom.sortable('option', 'disabled', disabled);
      if (Utils.isTouchScreenOrShowDesktopDragHandles()) {
        $checklistsDom.sortable({ handle: '.checklist-handle' });
      }
    }
    if ($subtasksDom.data('uiSortable') || $subtasksDom.data('sortable')) {
      $subtasksDom.sortable('option', 'disabled', disabled);
    }
  });
});

Template.cardDetails.onDestroyed(function () {
  const boardBody = getBoardBodyInstance();
  if (boardBody === null) return;
  boardBody.showOverlay.set(false);
});

Template.cardDetails.helpers({
  isWatching() {
    const card = Template.currentData();
    if (!card || typeof card.findWatcher !== 'function') return false;
    return card.findWatcher(Meteor.userId());
  },

  // #6081: number of times this card's due date has been changed, for
  // accountability. Returns 0 when unavailable so the template can hide it.
  dueDateChangeCount() {
    const card = Template.currentData();
    if (!card || typeof card.getDueDateChangeCount !== 'function') return 0;
    return card.getDueDateChangeCount();
  },

  // Returns the card's locations (multiple supported), each enriched with the
  // coordinate flag and OpenStreetMap link used by the template.
  getLocations() {
    const card = Template.currentData();
    if (!card || !card.getLocations) return [];
    const user = ReactiveCache.getCurrentUser();
    const provider = user ? user.getMapProvider() : 'openstreetmap';
    return card.getLocations().map((loc: any) => {
      const hasCoordinates =
        typeof loc.latitude === 'number' && typeof loc.longitude === 'number';
      const mapUrl = hasCoordinates
        ? mapLinkFor(provider, loc.latitude, loc.longitude)
        : '';
      return { ...loc, hasCoordinates, mapUrl };
    });
  },

  // #3392: PI Program Board "Red Strings". Resolve this card's dependencies
  // into card objects (with relation type, color, icon and a relative link).
  getDependencyCards() {
    const card = Template.currentData();
    if (!card || typeof card.getDependencies !== 'function') return [];
    return card
      .getDependencies()
      .map((dep: any) => {
        const target = ReactiveCache.getCard(dep.cardId);
        if (!target) return null;
        return {
          card: target,
          linkUrl: target.originRelativeUrl(),
          type: dep.type,
          color: dep.color,
          icon: dep.icon,
          typeLabel: `dependency-type-${dep.type}`,
          // Per-row relation-type dropdown options with the current one marked.
          typeOption: DEPENDENCY_TYPES.map(t => ({
            id: t.id,
            label: `dependency-type-${t.id}`,
            selected: t.id === dep.type,
          })),
        };
      })
      .filter(Boolean);
  },

  customFieldsGrid() {
    return ReactiveCache.getCurrentUser().hasCustomFieldsGrid();
  },

  cardMaximized() {
    const currentUser = ReactiveCache.getCurrentUser();
    const maximized = currentUser
      ? currentUser.hasCardMaximized()
      : window.localStorage.getItem('cardMaximized') === 'true';
    return !Utils.getPopupCardId() && maximized;
  },

  showActivities() {
    const card = Template.currentData();
    return card && card.showActivities;
  },

  cardCollapsed() {
    const user = ReactiveCache.getCurrentUser();
    if (user && user.profile) {
      return !!user.profile.cardCollapsed;
    }
    // getPublicCardCollapsed is a static helper on the Users model, not the
    // ambient collection type.
    if ((Users as any).getPublicCardCollapsed) {
      const stored = (Users as any).getPublicCardCollapsed();
      if (typeof stored === 'boolean') return stored;
    }
    return false;
  },

  presentParentTask() {
    const tpl = Template.instance() as CardDetailsInstance;
    let result = tpl.currentBoard.presentParentTask;
    if (result === null || result === undefined) {
      result = 'no-parent';
    }
    return result;
  },

  linkForCard() {
    const card = Template.currentData();
    let result = '#';
    if (card) {
      const board = ReactiveCache.getBoard(card.boardId);
      if (board) {
        result = FlowRouter.path('card', {
          boardId: card.boardId,
          slug: board.slug,
          cardId: card._id,
        });
      }
    }
    return result;
  },

  showVotingButtons() {
    const card = Template.currentData();
    // #6420: currentUser was referenced but never defined here, so the helper
    // threw "ReferenceError: currentUser is not defined" on every card render and
    // the voting buttons disappeared. Define it and guard the board-member call.
    const currentUser = ReactiveCache.getCurrentUser();
    return (
      currentUser &&
      (currentUser.isBoardMember() || card.voteAllowNonBoardMembers()) &&
      !card.expiredVote()
    );
  },

  showPlanningPokerButtons() {
    const card = Template.currentData();
    // #6420: same as showVotingButtons — currentUser was undefined here.
    const currentUser = ReactiveCache.getCurrentUser();
    return (
      currentUser &&
      (currentUser.isBoardMember() || card.pokerAllowNonBoardMembers()) &&
      !card.expiredPoker()
    );
  },

  isVerticalScrollbars() {
    const user = ReactiveCache.getCurrentUser();
    return user && user.isVerticalScrollbars();
  },

  currentSwimlaneListsSorted() {
    const card = Template.currentData();
    if (!card || !card.boardId) return [];
    const board = ReactiveCache.getBoard(card.boardId);
    if (!board) return [];
    const swimlaneId = card.swimlaneId;
    const selector: Record<string, any> = { boardId: card.boardId, archived: false };
    if (swimlaneId) {
      const defaultSwimlane = board.getDefaultSwimline && board.getDefaultSwimline();
      if (defaultSwimlane && defaultSwimlane._id === swimlaneId) {
        selector.swimlaneId = { $in: [swimlaneId, null, ''] };
      } else {
        selector.swimlaneId = swimlaneId;
      }
    }
    return ReactiveCache.getLists(selector, { sort: { sort: 1 } });
  },

  isCurrentListId(listId: any) {
    let data = Template.currentData();
    if (!data || typeof data.listId === 'undefined') {
      data = Template.parentData(1);
    }
    if (!data || typeof data.listId === 'undefined') return false;
    return data.listId == listId;
  },

  isLoaded() {
    return (Template.instance() as CardDetailsInstance).isLoaded;
  },
});

Template.cardDetails.events({
  [`${CSSEvents.transitionend} .js-card-details`](event: JQuery.TriggeredEvent, tpl: CardDetailsInstance) {
    tpl.isLoaded.set(true);
  },
  [`${CSSEvents.animationend} .js-card-details`](event: JQuery.TriggeredEvent, tpl: CardDetailsInstance) {
    tpl.isLoaded.set(true);
  },
  'scroll .js-card-details'(event: JQuery.TriggeredEvent, tpl: CardDetailsInstance) {
    tpl.infiniteScrolling.checkScrollPosition(event.currentTarget, () => {
      tpl.reachNextPeak();
    });
  },
  'click .js-card-collapse-toggle'(event: JQuery.TriggeredEvent, tpl: CardDetailsInstance) {
    const user = ReactiveCache.getCurrentUser();
    // getPublicCardCollapsed/setPublicCardCollapsed are static helpers on the
    // Users model, not the ambient collection type.
    const currentState = user && user.profile ? !!user.profile.cardCollapsed : !!(Users as any).getPublicCardCollapsed();
    if (user) {
      Meteor.call('setCardCollapsed', !currentState);
    } else if ((Users as any).setPublicCardCollapsed) {
      (Users as any).setPublicCardCollapsed(!currentState);
    }
  },
  'mousedown .js-card-drag-handle'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    const $card = $(event.target).closest('.card-details');
    const startX = event.clientX!;
    const startY = event.clientY!;
    const startLeft = $card.offset()!.left;
    const startTop = $card.offset()!.top;

    const onMouseMove = (e: JQuery.TriggeredEvent) => {
      const deltaX = e.clientX! - startX;
      const deltaY = e.clientY! - startY;
      $card.css({
        left: startLeft + deltaX + 'px',
        top: startTop + deltaY + 'px'
      });
    };

    const onMouseUp = () => {
      $(document).off('mousemove', onMouseMove);
      $(document).off('mouseup', onMouseUp);
    };

    $(document).on('mousemove', onMouseMove);
    $(document).on('mouseup', onMouseUp);
  },
  'mousedown .js-card-title-drag-handle'(event: JQuery.TriggeredEvent) {
    // Allow dragging from title for ReadOnly users
    // Don't interfere with text selection
    if (event.target.tagName === 'A' || $(event.target).closest('a').length > 0) {
      return; // Don't drag if clicking on links
    }

    event.preventDefault();
    const $card = $(event.target).closest('.card-details');
    const startX = event.clientX!;
    const startY = event.clientY!;
    const startLeft = $card.offset()!.left;
    const startTop = $card.offset()!.top;

    const onMouseMove = (e: JQuery.TriggeredEvent) => {
      const deltaX = e.clientX! - startX;
      const deltaY = e.clientY! - startY;
      $card.css({
        left: startLeft + deltaX + 'px',
        top: startTop + deltaY + 'px'
      });
    };

    const onMouseUp = () => {
      $(document).off('mousemove', onMouseMove);
      $(document).off('mouseup', onMouseUp);
    };

    $(document).on('mousemove', onMouseMove);
    $(document).on('mouseup', onMouseUp);
  },
  'click .js-close-card-details'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    event.stopPropagation();

    // When the card is shown inside a popup (opened from the Board Table view,
    // search results, or a mini-screen list), the redundant popup title header
    // is hidden, so this is the only close button. Close the popup and clear its
    // session state instead of running the board/route close flow below.
    if (Popup.isOpen() && Utils.getPopupCardId()) {
      // @types/meteor omits Session.delete (`delete` is a reserved word that
      // can't be declared on the Session namespace); it is a real Meteor API.
      (Session as any).delete('popupCardId');
      (Session as any).delete('popupCardBoardId');
      Popup.close();
      return;
    }

    // Resolve card context defensively because cardDetails can be rendered
    // from several parents (board, popup, gantt, etc.).
    const card = getCurrentCardFromContext({ ignorePopupCard: true }) || Template.currentData();
    const cardId = card?._id;
    const boardId = card?.boardId || Session.get('currentBoard') || Utils.getCurrentBoardId();

    // Desktop-sized layout uses the openCards session list.
    if (!Utils.isMiniScreen()) {
      if (cardId) {
        const openCards = Session.get('openCards') || [];
        const nextOpenCards = openCards.filter((id: any) => id !== cardId);
        Session.set('openCards', nextOpenCards);

        if (Session.get('currentCard') === cardId) {
          Session.set('currentCard', null);
        }

        const route = FlowRouter.current();
        const routeCardId = route?.params?.cardId;
        if (routeCardId === cardId && boardId) {
          Utils.goBoardId(boardId);
          return;
        }
      }
      return;
    }

    // Mini-screen/card-route flow: clear active card state and go back to board.
    Session.set('currentCard', null);
    // Session.delete is a real Meteor API missing from @types/meteor.
    (Session as any).delete('popupCardId');
    (Session as any).delete('popupCardBoardId');

    if (boardId) {
      Utils.goBoardId(boardId);
    }
  },
  'click .js-copy-link'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    event.preventDefault();
    const card = Template.currentData();
    const url = card.absoluteUrl();
    const promise = Utils.copyTextToClipboard(url);

    const $tooltip = tpl.$('.card-details-header .copied-tooltip');
    Utils.showCopied(promise, $tooltip);
  },
  'change .js-date-format-selector'(event: JQuery.TriggeredEvent) {
    const dateFormat = event.target.value;
    if (Meteor.userId()) {
      Meteor.call('changeDateFormat', dateFormat);
    } else {
      window.localStorage.setItem('dateFormat', dateFormat);
    }
  },
  'click .js-open-card-details-menu': Popup.open('cardDetailsActions'),
  // Mobile: switch to desktop popup view (maximize)
  'click .js-mobile-switch-to-desktop'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    // Switch global mode to desktop so the card appears as desktop popup
    Utils.setMobileMode(false);
  },
  'click .js-card-zoom-in'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    const current = Utils.getCardZoom();
    const newZoom = Math.min(3.0, current + 0.1);
    Utils.setCardZoom(newZoom);
  },
  'click .js-card-zoom-out'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    const current = Utils.getCardZoom();
    const newZoom = Math.max(0.5, current - 0.1);
    Utils.setCardZoom(newZoom);
  },
  'click .js-card-mobile-desktop-toggle'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    const currentMode = Utils.getMobileMode();
    Utils.setMobileMode(!currentMode);
  },
  async 'submit .js-card-description'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    event.preventDefault();
    const description = (tpl.find('.js-new-description-input') as HTMLInputElement).value;
    const card = Template.currentData();
    // #5809: surface a visible error instead of failing silently — e.g. editing
    // a linked card whose target is on a board the user cannot write to gets a
    // permission denial that otherwise vanished with no feedback.
    try {
      await card.setDescription(description);
    } catch (error) {
      alert(error?.reason || error?.message || 'Failed to save description');
    }
  },
  async 'submit .js-card-details-title'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    event.preventDefault();
    const titleInput = tpl.find('.js-edit-card-title') as HTMLInputElement | null;
    const title = titleInput ? titleInput.value.trim() : '';
    const card = Template.currentData();
    // #5809: surface a visible error instead of failing silently (see above).
    try {
      await card.setTitle(title || '');
    } catch (error) {
      alert(error?.reason || error?.message || 'Failed to save title');
    }
  },
  'submit .js-card-details-assigner'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    event.preventDefault();
    const assignerInput = tpl.find('.js-edit-card-assigner') as HTMLInputElement | null;
    const assigner = assignerInput ? assignerInput.value.trim() : '';
    const card = Template.currentData();
    if (assigner) {
      card.setAssignedBy(assigner);
    } else {
      card.setAssignedBy('');
    }
  },
  'submit .js-card-details-requester'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    event.preventDefault();
    const requesterInput = tpl.find('.js-edit-card-requester') as HTMLInputElement | null;
    const requester = requesterInput ? requesterInput.value.trim() : '';
    const card = Template.currentData();
    if (requester) {
      card.setRequestedBy(requester);
    } else {
      card.setRequestedBy('');
    }
  },
  'keydown input.js-edit-card-sort'(evt: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    // enter = save
    if (evt.keyCode === 13) {
      (tpl.find('button[type=submit]') as HTMLElement).click();
    }
  },
  async 'submit .js-card-details-sort'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    event.preventDefault();
    const sortInput = tpl.find('.js-edit-card-sort') as HTMLInputElement | null;
    const sort = parseFloat(sortInput ? sortInput.value.trim() : '');
    if (!Number.isNaN(sort)) {
      let card = Template.currentData();
      await card.move(card.boardId, card.swimlaneId, card.listId, sort);
    }
  },
  async 'change .js-select-card-details-lists'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const listId = event.target.value;
    let card = Template.currentData();

    const minOrder = await card.getMinSort(listId, card.swimlaneId);
    await card.move(card.boardId, card.swimlaneId, listId, minOrder - 1);
  },
  'click .js-go-to-linked-card'() {
    const card = Template.currentData();
    Utils.goCardId(card.linkedId);
  },
  'click .js-add-dependency': Popup.open('cardDependencies'),
  'click .js-remove-dependency'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!Utils.canModifyCard()) return;
    const targetId = event.currentTarget.dataset.targetId;
    const card = Template.currentData();
    if (card && targetId) {
      card.removeDependency(targetId);
    }
  },
  'change .js-dependency-type'(event: JQuery.TriggeredEvent) {
    if (!Utils.canModifyCard()) return;
    const targetId = event.currentTarget.dataset.targetId;
    const card = Template.currentData();
    if (card && targetId) {
      card.setDependencyProps(targetId, { type: event.currentTarget.value });
    }
  },
  'change .js-dependency-color'(event: JQuery.TriggeredEvent) {
    if (!Utils.canModifyCard()) return;
    const targetId = event.currentTarget.dataset.targetId;
    const card = Template.currentData();
    if (card && targetId) {
      card.setDependencyProps(targetId, { color: event.currentTarget.value });
    }
  },
  'click .js-dependency-icon'(event: JQuery.TriggeredEvent) {
    if (!Utils.canModifyCard()) return;
    // Remember the source card + which dependency the picked icon applies to.
    editingDependencyCard = Template.currentData();
    editingDependencyTargetId = event.currentTarget.dataset.targetId;
    Popup.open('cardDependencyIcon')(event);
  },
  'click .js-member': Popup.open('cardMember'),
  'click .js-add-members': Popup.open('cardMembers'),
  'click .js-assignee': Popup.open('cardAssignee'),
  'click .js-add-assignees': Popup.open('cardAssignees'),
  'click .js-add-labels': Popup.open('cardLabels'),
  'click .js-add-stickers': Popup.open('cardStickers'),
  'click .js-remove-sticker'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!Utils.canModifyCard()) return;
    const index = parseInt(event.currentTarget.dataset.index, 10);
    const card = Template.currentData();
    if (card && !Number.isNaN(index)) {
      card.removeStickerAt(index);
    }
  },
  'click .js-add-location'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    if (!Utils.canModifyCard()) return;
    const card = Template.currentData();
    editingLocationId.set(null);
    Popup.open('cardLocations')(event, {
      dataContextIfCurrentDataIsUndefined: card,
    });
  },
  'click .js-edit-location'(event: JQuery.TriggeredEvent) {
    // Let the "Open in map" link work without also opening the edit popup.
    if ($(event.target).closest('a.card-location-map').length) return;
    event.preventDefault();
    if (!Utils.canModifyCard()) return;
    const card = Template.currentData();
    editingLocationId.set(event.currentTarget.dataset.locationId || null);
    Popup.open('cardLocations')(event, {
      dataContextIfCurrentDataIsUndefined: card,
    });
  },
  'click .js-remove-location'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!Utils.canModifyCard()) return;
    const locationId = event.currentTarget.dataset.locationId;
    const card = Template.currentData();
    if (card && locationId) {
      card.removeLocation(locationId);
    }
  },
  'click .js-received-date': Popup.open('editCardReceivedDate'),
  'click .js-start-date': Popup.open('editCardStartDate'),
  'click .js-due-date': Popup.open('editCardDueDate'),
  'click .js-toggle-due-complete'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!Utils.canModifyCard()) return;
    const card = Template.currentData();
    card.setDueComplete(!card.getDueComplete());
  },
  'click .js-end-date': Popup.open('editCardEndDate'),
  'click .js-show-positive-votes': Popup.open('positiveVoteMembers'),
  'click .js-show-negative-votes': Popup.open('negativeVoteMembers'),
  'click .js-custom-fields': Popup.open('cardCustomFields'),
  'mouseenter .js-card-details'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const boardBody = getBoardBodyInstance(tpl);
    if (boardBody === null) return;
    boardBody.showOverlay.set(true);
    boardBody.mouseHasEnterCardDetails = true;
  },
  'mousedown .js-card-details'() {
    Session.set('cardDetailsIsDragging', false);
    Session.set('cardDetailsIsMouseDown', true);
  },
  'mousemove .js-card-details'() {
    if (Session.get('cardDetailsIsMouseDown')) {
      Session.set('cardDetailsIsDragging', true);
    }
  },
  'mouseup .js-card-details'() {
    Session.set('cardDetailsIsDragging', false);
    Session.set('cardDetailsIsMouseDown', false);
  },
  async 'click #toggleHideCheckedChecklistItems'() {
    const card = Template.currentData();
    await card.toggleHideCheckedChecklistItems();
  },
  async 'change #toggleShowActivitiesCard'() {
    const card = Template.currentData();
    await card.toggleShowActivities();
  },
  'click #toggleCustomFieldsGridButton'() {
    Meteor.call('toggleCustomFieldsGrid');
  },
  'click .js-maximize-card-details'() {
    if (Meteor.userId()) {
      Meteor.call('toggleCardMaximized');
    } else {
      window.localStorage.setItem('cardMaximized', 'true');
    }
    autosize($('.card-details'));
  },
  'click .js-minimize-card-details'() {
    if (Meteor.userId()) {
      Meteor.call('toggleCardMaximized');
    } else {
      window.localStorage.setItem('cardMaximized', 'false');
    }
    autosize($('.card-details'));
  },
  'click .js-vote'(e: JQuery.TriggeredEvent) {
    const card = Template.currentData();
    const forIt = $(e.target).hasClass('js-vote-positive');
    let newState: boolean | null = null;
    if (
      card.voteState() === null ||
      (card.voteState() === false && forIt) ||
      (card.voteState() === true && !forIt)
    ) {
      newState = forIt;
    }
    // Use secure server method; direct client updates to vote are blocked
    Meteor.call('cards.vote', card._id, newState);
  },
  'click .js-poker'(e: JQuery.TriggeredEvent) {
    const card = Template.currentData();
    let newState: string | null = null;
    if ($(e.target).hasClass('js-poker-vote-one')) {
      newState = 'one';
      Meteor.call('cards.pokerVote', card._id, newState);
    }
    if ($(e.target).hasClass('js-poker-vote-two')) {
      newState = 'two';
      Meteor.call('cards.pokerVote', card._id, newState);
    }
    if ($(e.target).hasClass('js-poker-vote-three')) {
      newState = 'three';
      Meteor.call('cards.pokerVote', card._id, newState);
    }
    if ($(e.target).hasClass('js-poker-vote-five')) {
      newState = 'five';
      Meteor.call('cards.pokerVote', card._id, newState);
    }
    if ($(e.target).hasClass('js-poker-vote-eight')) {
      newState = 'eight';
      Meteor.call('cards.pokerVote', card._id, newState);
    }
    if ($(e.target).hasClass('js-poker-vote-thirteen')) {
      newState = 'thirteen';
      Meteor.call('cards.pokerVote', card._id, newState);
    }
    if ($(e.target).hasClass('js-poker-vote-twenty')) {
      newState = 'twenty';
      Meteor.call('cards.pokerVote', card._id, newState);
    }
    if ($(e.target).hasClass('js-poker-vote-forty')) {
      newState = 'forty';
      Meteor.call('cards.pokerVote', card._id, newState);
    }
    if ($(e.target).hasClass('js-poker-vote-one-hundred')) {
      newState = 'oneHundred';
      Meteor.call('cards.pokerVote', card._id, newState);
    }
    if ($(e.target).hasClass('js-poker-vote-unsure')) {
      newState = 'unsure';
      Meteor.call('cards.pokerVote', card._id, newState);
    }
  },
  'click .js-poker-finish'(e: JQuery.TriggeredEvent) {
    if ($(e.target).hasClass('js-poker-finish')) {
      e.preventDefault();
      const card = Template.currentData();
      const now = new Date();
      Meteor.call('cards.setPokerEnd', card._id, now);
    }
  },
  'click .js-poker-replay'(e: JQuery.TriggeredEvent) {
    if ($(e.target).hasClass('js-poker-replay')) {
      e.preventDefault();
      const currentCard = Template.currentData();
      Meteor.call('cards.replayPoker', currentCard._id);
      Meteor.call('cards.unsetPokerEnd', currentCard._id);
      Meteor.call('cards.unsetPokerEstimation', currentCard._id);
    }
  },
  'click .js-poker-estimation'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    event.preventDefault();
    const card = Template.currentData();
    const ruleTitle = (tpl.find('#pokerEstimation') as HTMLInputElement).value;
    if (ruleTitle !== undefined && ruleTitle !== '') {
      (tpl.find('#pokerEstimation') as HTMLInputElement).value = '';

      if (ruleTitle) {
        Meteor.call('cards.setPokerEstimation', card._id, parseInt(ruleTitle, 10));
      } else {
        Meteor.call('cards.unsetPokerEstimation', card._id);
      }
    }
  },
  // Drag and drop file upload handlers
  'dragover .js-card-details'(event: JQuery.TriggeredEvent) {
    // Only prevent default for file drags to avoid interfering with other drag operations
    const dataTransfer = (event.originalEvent as DragEvent).dataTransfer;
    if (dataTransfer && dataTransfer.types && dataTransfer.types.includes('Files')) {
      event.preventDefault();
      event.stopPropagation();
    }
  },
  'dragenter .js-card-details'(event: JQuery.TriggeredEvent) {
    const dataTransfer = (event.originalEvent as DragEvent).dataTransfer;
    if (dataTransfer && dataTransfer.types && dataTransfer.types.includes('Files')) {
      event.preventDefault();
      event.stopPropagation();
      const card = Template.currentData();
      const board = card.board();
      // Only allow drag-and-drop if user can modify card and board allows attachments
      if (Utils.canModifyCard() && board && board.allowsAttachments) {
        $(event.currentTarget).addClass('is-dragging-over');
      }
    }
  },
  'dragleave .js-card-details'(event: JQuery.TriggeredEvent) {
    const dataTransfer = (event.originalEvent as DragEvent).dataTransfer;
    if (dataTransfer && dataTransfer.types && dataTransfer.types.includes('Files')) {
      event.preventDefault();
      event.stopPropagation();
      $(event.currentTarget).removeClass('is-dragging-over');
    }
  },
  'drop .js-card-details'(event: JQuery.TriggeredEvent) {
    const dataTransfer = (event.originalEvent as DragEvent).dataTransfer;
    if (dataTransfer && dataTransfer.types && dataTransfer.types.includes('Files')) {
      event.preventDefault();
      event.stopPropagation();
      $(event.currentTarget).removeClass('is-dragging-over');

      const card = Template.currentData();
      const board = card.board();

      // Check permissions
      if (!Utils.canModifyCard() || !board || !board.allowsAttachments) {
        return;
      }

      // Check if this is a file drop (not a checklist item reorder)
      if (!dataTransfer.files || dataTransfer.files.length === 0) {
        return;
      }

      const files = dataTransfer.files;
      if (files && files.length > 0) {
        handleFileUpload(card, files);
      }
    }
  },
});

Template.cardDetails.helpers({
  isPopup() {
    let ret = !!Utils.getPopupCardId();
    return ret;
  },
  isDateFormat(format: any) {
    const currentUser = ReactiveCache.getCurrentUser();
    if (!currentUser) {
      const stored = window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD';
      return format === stored;
    }
    return currentUser.getDateFormat() === format;
  },
  // Upload progress helpers
  hasActiveUploads(this: any) {
    return uploadProgressManager.hasActiveUploads(this._id);
  },
  uploads(this: any) {
    return uploadProgressManager.getUploadsForCard(this._id);
  },
  uploadCount(this: any) {
    return uploadProgressManager.getUploadCountForCard(this._id);
  }
});
Template.cardDetailsPopup.onDestroyed(() => {
  // Session.delete is a real Meteor API missing from @types/meteor.
  (Session as any).delete('popupCardId');
  (Session as any).delete('popupCardBoardId');
});
Template.cardDetailsPopup.helpers({
  popupCard() {
    const ret = Utils.getPopupCard();
    return ret;
  },
});

// Ordered list of Excel export field keys and their i18n label keys.
// Must match ALL_FIELDS in models/server/ExporterExcelCard.js.
const EXCEL_EXPORT_FIELDS = [
  { field: 'labels',      label: 'labels' },
  { field: 'people',      label: 'export-card-field-people' },
  { field: 'board-info',  label: 'export-card-field-board-info' },
  { field: 'dates',       label: 'export-card-field-dates' },
  { field: 'description', label: 'description' },
  { field: 'checklists',  label: 'checklists' },
  { field: 'subtasks',    label: 'export-card-subtasks' },
  { field: 'comments',    label: 'comments' },
  { field: 'attachments', label: 'attachments' },
];

Template.exportCardPopup.onCreated(function (this: ExportCardPopupInstance) {
  // Track which Excel sections the user wants to include (all on by default)
  const initial: Record<string, boolean> = {};
  EXCEL_EXPORT_FIELDS.forEach(({ field }) => { initial[field] = true; });
  // Meteor's ReactiveDict accepts initial data as its first arg at runtime, but
  // @types only types the name there; pass it as the (typed) second arg.
  this.excelFields = new ReactiveDict<Record<string, boolean>>(undefined, initial);
});

Template.exportCardPopup.helpers({
  exportUrlCardPDF(this: any) {
    const card = getCurrentCardFromContext({ ignorePopupCard: true }) || this;
    const params = {
      boardId: card.boardId || Session.get('currentBoard'),
      listId: card.listId,
      cardId: card._id || card.cardId,
    };
    return FlowRouter.path(
      '/api/boards/:boardId/lists/:listId/cards/:cardId/exportPDF',
      params,
      { authToken: Accounts._storedLoginToken() },
    );
  },
  exportFilenameCardPDF(this: any) {
    const card = getCurrentCardFromContext({ ignorePopupCard: true }) || this;
    return `${String(card.title || 'export-card')
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'export-card'}.pdf`;
  },
  // Returns the field list with current checked state — reactive
  excelExportFields() {
    const instance = Template.instance() as ExportCardPopupInstance;
    return EXCEL_EXPORT_FIELDS.map(f => ({
      field:   f.field,
      label:   f.label,
      checked: instance.excelFields.get(f.field),
    }));
  },
  exportUrlCardExcel(this: any) {
    const instance = Template.instance() as ExportCardPopupInstance;
    const card = getCurrentCardFromContext({ ignorePopupCard: true }) || this;
    const params = {
      boardId: card.boardId || Session.get('currentBoard'),
      listId:  card.listId,
      cardId:  card._id || card.cardId,
    };
    const selectedFields = EXCEL_EXPORT_FIELDS
      .map(f => f.field)
      .filter(f => instance.excelFields.get(f));
    return FlowRouter.path(
      '/api/boards/:boardId/lists/:listId/cards/:cardId/exportExcel',
      params,
      { authToken: Accounts._storedLoginToken(), fields: selectedFields.join(','), lang: TAPi18n.getLanguage() },
    );
  },
  exportFilenameCardExcel(this: any) {
    const card = getCurrentCardFromContext({ ignorePopupCard: true }) || this;
    return `${String(card.title || 'export-card')
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'export-card'}.xlsx`;
  },
});

Template.exportCardPopup.events({
  'click .js-excel-field-toggle'(event: JQuery.TriggeredEvent, instance: ExportCardPopupInstance) {
    event.preventDefault();
    const field = event.currentTarget.dataset.field as string;
    instance.excelFields.set(field, !instance.excelFields.get(field));
  },
});

// only allow number input
Template.editCardSortOrderForm.onRendered(function (this: Blaze.TemplateInstance) {
  this.$('input').on("keypress paste", function (this: HTMLElement, event: JQuery.TriggeredEvent) {
    let keyCode = event.keyCode!;
    let charCode = String.fromCharCode(keyCode);
    let regex = new RegExp('[-0-9.]');
    let ret = regex.test(charCode);
    // only working here, defining in events() doesn't handle the return value correctly
    return ret;
  });
});

// inlinedCardDescription extends the normal inlinedForm to support UnsavedEdits
// draft feature for card descriptions.
Template.inlinedCardDescription.onCreated(function (this: InlinedCardDescriptionInstance) {
  this.isOpen = new ReactiveVar(false);

  this._getUnsavedEditKey = () => ({
    fieldName: 'cardDescription',
    docId: getCardId(),
  });

  this._getValue = () => {
    const input = this.find('textarea,input[type=text]') as HTMLInputElement | null;
    return this.isOpen.get() && input && input.value.replaceAll(/[ \f\r\t\v]+$/gm, '');
  };

  this._close = (isReset = false) => {
    if (this.isOpen.get() && !isReset) {
      const draft = (this._getValue() || '').trim();
      const card = getCurrentCardFromContext();
      if (card && draft !== card.getDescription()) {
        UnsavedEdits.set(this._getUnsavedEditKey(), this._getValue());
      }
    }
    this.isOpen.set(false);
  };

  this._reset = () => {
    UnsavedEdits.reset(this._getUnsavedEditKey());
    this._close(true);
  };
});

Template.inlinedCardDescription.helpers({
  isOpen() {
    return (Template.instance() as InlinedCardDescriptionInstance).isOpen;
  },
});

Template.inlinedCardDescription.events({
  'click .js-close-inlined-form'(evt: JQuery.TriggeredEvent, tpl: InlinedCardDescriptionInstance) {
    tpl._reset();
  },
  'click .js-open-inlined-form'(evt: JQuery.TriggeredEvent, tpl: InlinedCardDescriptionInstance) {
    evt.preventDefault();
    EscapeActions.clickExecute(evt.target, 'inlinedForm');
    tpl.isOpen.set(true);
  },
  'keydown form textarea'(evt: JQuery.TriggeredEvent, tpl: InlinedCardDescriptionInstance) {
    if (evt.keyCode === 13 && (evt.metaKey || evt.ctrlKey)) {
      (tpl.find('button[type=submit]') as HTMLElement).click();
    }
  },
  submit(evt: JQuery.TriggeredEvent, tpl: InlinedCardDescriptionInstance) {
    const data = Template.currentData();
    if (data.autoclose !== false) {
      Tracker.afterFlush(() => {
        tpl._close();
      });
    }
  },
});

Template.cardDetailsActionsPopup.helpers({
  isWatching(this: any) {
    if (!this || typeof this.findWatcher !== 'function') return false;
    return this.findWatcher(Meteor.userId());
  },

  isBoardAdmin() {
    return ReactiveCache.getCurrentUser()?.isBoardAdmin();
  },

  showListOnMinicard(this: any) {
    return this.showListOnMinicard;
  },
});

Template.cardDetailsActionsPopup.events({
  'click .js-export-card': Popup.open('exportCard'),
  'click .js-members': Popup.open('cardMembers'),
  'click .js-assignees': Popup.open('cardAssignees'),
  'click .js-attachments': Popup.open('cardAttachments'),
  'click .js-start-voting': Popup.open('cardStartVoting'),
  'click .js-start-planning-poker': Popup.open('cardStartPlanningPoker'),
  'click .js-custom-fields': Popup.open('cardCustomFields'),
  'click .js-received-date': Popup.open('editCardReceivedDate'),
  'click .js-start-date': Popup.open('editCardStartDate'),
  'click .js-due-date': Popup.open('editCardDueDate'),
  'click .js-end-date': Popup.open('editCardEndDate'),
  'click .js-spent-time': Popup.open('editCardSpentTime'),
  'click .js-move-card': Popup.open('moveCard'),
  'click .js-copy-card': Popup.open('copyCard'),
  'click .js-convert-checklist-item-to-card': Popup.open('convertChecklistItemToCard'),
  'click .js-copy-checklist-cards': Popup.open('copyManyCards'),
  'click .js-set-card-color': Popup.open('setCardColor'),
  async 'click .js-move-card-to-top'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    const card = Cards.findOne(getCardId());
    if (!card) return;
    const minOrder = await card.getMinSort() || 0;
    await card.move(card.boardId, card.swimlaneId, card.listId, minOrder - 1);
    Popup.back();
  },
  async 'click .js-move-card-to-bottom'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    const card = Cards.findOne(getCardId());
    if (!card) return;
    const maxOrder = await card.getMaxSort() || 0;
    await card.move(card.boardId, card.swimlaneId, card.listId, maxOrder + 1);
    Popup.back();
  },
  'click .js-archive': Popup.afterConfirm('cardArchive', async function () {
    if (!canArchiveCard({ canModifyCard: Utils.canModifyCard() })) return;
    const card = Cards.findOne(getCardId());
    Popup.close();
    if (!card) return;
    await card.archive();
    Utils.goBoardId(card.boardId);
  }),
  'click .js-more': Popup.open('cardMore'),
  'click .js-toggle-watch-card'() {
    const currentCard = Cards.findOne(getCardId());
    if (!currentCard) return;
    const level = currentCard.findWatcher(Meteor.userId()) ? null : 'watching';
    // Meteor.call callback error/result are untyped.
    Meteor.call('watch', 'card', currentCard._id, level, (err: any, ret: any) => {
      if (!err && ret) Popup.close();
    });
  },
  'click .js-toggle-show-list-on-minicard'() {
    const currentCard = Cards.findOne(getCardId());
    if (!currentCard) return;
    const newValue = !currentCard.showListOnMinicard;
    Cards.update(currentCard._id, { $set: { showListOnMinicard: newValue } });
    Popup.close();
  },
});

Template.editCardTitleForm.onRendered(function (this: Blaze.TemplateInstance) {
  autosize(this.$('textarea.js-edit-card-title'));
});

Template.editCardTitleForm.events({
  'click a.fa.fa-copy'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const $editor = tpl.$('textarea');
    const promise = Utils.copyTextToClipboard(($editor[0] as HTMLTextAreaElement).value);

    const $tooltip = tpl.$('.copied-tooltip');
    Utils.showCopied(promise, $tooltip);
  },
  'keydown .js-edit-card-title'(event: JQuery.TriggeredEvent) {
    // If enter key was pressed, submit the data
    // Unless the shift key is also being pressed
    if (event.keyCode === 13 && !event.shiftKey) {
      $('.js-submit-edit-card-title-form').click();
    }
  },
});

Template.cardMembersPopup.onCreated(function (this: FilterTermPopupInstance) {
  // #4965: only the filter term is stored reactively; the candidate list is
  // derived reactively in the members() helper (via filterMembers, which reads
  // board.activeMembers() on each call). Previously the list was snapshotted
  // once here, so a member added to the board after the popup opened — or whose
  // user document finished loading after open — was missing until the popup was
  // reopened.
  this.filterTerm = new ReactiveVar('');
});

Template.cardMembersPopup.events({
  'click .js-select-member'(this: any, event: JQuery.TriggeredEvent) {
    const card = getCurrentCardFromContext();
    if (!card) return;
    const memberId = this.userId;
    card.toggleMember(memberId);
    event.preventDefault();
  },
  'keyup .card-members-filter'(event: JQuery.TriggeredEvent) {
    (Template.instance() as FilterTermPopupInstance).filterTerm.set(event.target.value);
  }
});

Template.cardMembersPopup.helpers({
  isCardMember(this: any) {
    const card = getCurrentCardFromContext();
    if (!card) return false;
    const cardMembers = card.getMembers();

    return (cardMembers || []).includes(this.userId);
  },

  members() {
    const members = filterMembers((Template.instance() as FilterTermPopupInstance).filterTerm.get());
    const uniqueMembers = uniqBy(members, 'userId');
    return [...uniqueMembers].sort((a: any, b: any) => {
      const userA = ReactiveCache.getUser(a.userId);
      const userB = ReactiveCache.getUser(b.userId);
      const nameA = userA ? userA.profile.fullname : '';
      const nameB = userB ? userB.profile.fullname : '';
      return nameA.localeCompare(nameB);
    });
  },
  userData(this: any) {
    return ReactiveCache.getUser(this.userId);
  },
});

// Popup that adds or edits a single card location (name, address, latitude,
// longitude). Cards can hold multiple locations, like members.
Template.cardLocationsPopup.onCreated(function (this: CardLocationsPopupInstance) {
  const data = Template.currentData();
  this.cardId = data && data._id;
  this.detectMsg = new ReactiveVar('');
  this.mapSavedMsg = new ReactiveVar('');
});

Template.cardLocationsPopup.helpers({
  location() {
    const tpl = Template.instance() as CardLocationsPopupInstance;
    const card = ReactiveCache.getCard(tpl.cardId);
    const id = editingLocationId.get();
    if (card && id) {
      const found = card.getLocations().find((loc: any) => loc._id === id);
      if (found) return found;
    }
    return {};
  },
  detectMessage() {
    return (Template.instance() as CardLocationsPopupInstance).detectMsg.get();
  },
  isMapProvider(provider: any) {
    const user = ReactiveCache.getCurrentUser();
    const current = user ? user.getMapProvider() : 'openstreetmap';
    return current === provider;
  },
  mapSavedMessage() {
    return (Template.instance() as CardLocationsPopupInstance).mapSavedMsg.get();
  },
});

Template.cardLocationsPopup.events({
  'click .js-detect-location'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    const tpl = Template.instance() as CardLocationsPopupInstance;
    const linkInput = tpl.find('.js-location-map-link') as HTMLInputElement | null;
    const parsed = parseMapLink(linkInput ? linkInput.value : '');
    let filled = false;
    if (typeof parsed.latitude === 'number') {
      (tpl.find('.js-location-latitude') as HTMLInputElement).value = String(parsed.latitude);
      (tpl.find('.js-location-longitude') as HTMLInputElement).value = String(parsed.longitude);
      filled = true;
    }
    if (parsed.name) {
      (tpl.find('.js-location-name') as HTMLInputElement).value = parsed.name;
      filled = true;
    }
    if (parsed.address) {
      (tpl.find('.js-location-address') as HTMLInputElement).value = parsed.address;
      filled = true;
    }
    tpl.detectMsg.set(
      TAPi18n.__(filled ? 'location-detect-done' : 'location-detect-none'),
    );
  },
  'submit .js-card-location-form'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    const tpl = Template.instance() as CardLocationsPopupInstance;
    const card = ReactiveCache.getCard(tpl.cardId);
    if (!card) {
      Popup.back();
      return;
    }
    const name = (tpl.find('.js-location-name') as HTMLInputElement).value.trim();
    const address = (tpl.find('.js-location-address') as HTMLInputElement).value.trim();
    const latRaw = (tpl.find('.js-location-latitude') as HTMLInputElement).value.trim();
    const lonRaw = (tpl.find('.js-location-longitude') as HTMLInputElement).value.trim();
    const latitude = latRaw === '' ? undefined : parseFloat(latRaw);
    const longitude = lonRaw === '' ? undefined : parseFloat(lonRaw);
    const data = { name, address, latitude, longitude };
    const id = editingLocationId.get();
    if (id) {
      card.updateLocation(id, data);
    } else {
      card.addLocation(data);
    }
    Popup.back();
  },
  'click .js-delete-location'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    const tpl = Template.instance() as CardLocationsPopupInstance;
    const card = ReactiveCache.getCard(tpl.cardId);
    const id = editingLocationId.get();
    if (card && id) {
      card.removeLocation(id);
    }
    Popup.back();
  },
  'click .js-save-map-provider'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    const tpl = Template.instance() as CardLocationsPopupInstance;
    const select = tpl.find('.js-map-provider') as HTMLSelectElement | null;
    const provider = select ? select.value : 'openstreetmap';
    // Meteor.call callback error is untyped.
    Meteor.call('setMapProvider', provider, (err: any) => {
      tpl.mapSavedMsg.set(
        TAPi18n.__(err ? 'server-error' : 'map-provider-saved'),
      );
    });
  },
});

const filterMembers = (filterTerm: string) => {
  let currBoard = Utils.getCurrentBoard();
  let members = currBoard.activeMembers();

  if (filterTerm) {
    const searchTerm = filterTerm.toLowerCase();
    members = members
      .map((member: any) => ({
        member,
        user: ReactiveCache.getUser(member.userId)
      }))
      .filter(({ user }: any) => {
        // Check if user data is available
        if (!user || !user.profile) {
          return false;
        }
        const fullname = (user.profile.fullname || '').toLowerCase();
        const username = (user.username || '').toLowerCase();
        return fullname.indexOf(searchTerm) !== -1 || username.indexOf(searchTerm) !== -1;
      })
      .map(({ member }: any) => member);
  }
  return members;
}

Template.editCardRequesterForm.onRendered(function (this: Blaze.TemplateInstance) {
  autosize(this.$('.js-edit-card-requester'));
});

Template.editCardRequesterForm.events({
  'keydown .js-edit-card-requester'(event: JQuery.TriggeredEvent) {
    // If enter key was pressed, submit the data
    if (event.keyCode === 13) {
      $('.js-submit-edit-card-requester-form').click();
    }
  },
});

Template.editCardAssignerForm.onRendered(function (this: Blaze.TemplateInstance) {
  autosize(this.$('.js-edit-card-assigner'));
});

Template.editCardAssignerForm.events({
  'keydown .js-edit-card-assigner'(event: JQuery.TriggeredEvent) {
    // If enter key was pressed, submit the data
    if (event.keyCode === 13) {
      $('.js-submit-edit-card-assigner-form').click();
    }
  },
});

/**
 * Helper: register standard board/swimlane/list/card dialog helpers and events
 * for a template that uses BoardSwimlaneListCardDialog.
 */
function registerCardDialogTemplate(templateName: string) {
  // Template is indexed dynamically by name here; the static type has no index.
  (Template as any)[templateName].helpers({
    boards() {
      return (Template.instance() as CardDialogInstance).dialog.boards();
    },
    swimlanes() {
      return (Template.instance() as CardDialogInstance).dialog.swimlanes();
    },
    lists() {
      return (Template.instance() as CardDialogInstance).dialog.lists();
    },
    cards() {
      return (Template.instance() as CardDialogInstance).dialog.cards();
    },
    isDialogOptionBoardId(boardId: any) {
      return (Template.instance() as CardDialogInstance).dialog.isDialogOptionBoardId(boardId);
    },
    isDialogOptionSwimlaneId(swimlaneId: any) {
      return (Template.instance() as CardDialogInstance).dialog.isDialogOptionSwimlaneId(swimlaneId);
    },
    isDialogOptionListId(listId: any) {
      return (Template.instance() as CardDialogInstance).dialog.isDialogOptionListId(listId);
    },
    isSelectedBoardId(boardId: any) {
      return (Template.instance() as CardDialogInstance).dialog.isSelectedBoardId(boardId);
    },
    isSelectedSwimlaneId(swimlaneId: any) {
      return (Template.instance() as CardDialogInstance).dialog.isSelectedSwimlaneId(swimlaneId);
    },
    isSelectedListId(listId: any) {
      return (Template.instance() as CardDialogInstance).dialog.isSelectedListId(listId);
    },
    isDialogOptionCardId(cardId: any) {
      return (Template.instance() as CardDialogInstance).dialog.isDialogOptionCardId(cardId);
    },
    isTitleDefault(title: any) {
      return (Template.instance() as CardDialogInstance).dialog.isTitleDefault(title);
    },
  });

  (Template as any)[templateName].events({
    async 'click .js-done'(event: JQuery.TriggeredEvent, tpl: CardDialogInstance) {
      const dialog = tpl.dialog;
      // Read the target board/swimlane/list from the dialog's live reactive
      // selection rather than the DOM <select> elements.  A reactive re-render
      // (e.g. the boards() helper transiently returning [] while a 'board'
      // subscription re-resolves) can leave a <select> momentarily option-less,
      // making selectedIndex -1 and the scraped id undefined — which then makes
      // card.move()/copyCard() fail with a 403 "may only update documents by ID"
      // validation error.  The reactive vars stay correct across those renders.
      const boardId = dialog.selectedBoardId.get();
      const swimlaneId = dialog.selectedSwimlaneId.get();
      const listId = dialog.selectedListId.get();

      const cardSelect = tpl.$('.js-select-cards')[0] as HTMLSelectElement | undefined;
      const cardId = (cardSelect?.options?.length ?? 0) > 0
        ? cardSelect!.options[cardSelect!.selectedIndex].value
        : null;

      const options = { boardId, swimlaneId, listId, cardId };
      try {
        await dialog.setDone(cardId, options);
      } catch (e) {
        console.error('Error in card dialog operation:', e);
      }
      Popup.back(2);
    },
    'change .js-select-boards'(event: JQuery.TriggeredEvent, tpl: CardDialogInstance) {
      tpl.dialog.getBoardData($(event.currentTarget).val());
    },
    'change .js-select-swimlanes'(event: JQuery.TriggeredEvent, tpl: CardDialogInstance) {
      tpl.dialog.selectedSwimlaneId.set($(event.currentTarget).val());
      tpl.dialog.setFirstListId();
    },
    'change .js-select-lists'(event: JQuery.TriggeredEvent, tpl: CardDialogInstance) {
      tpl.dialog.selectedListId.set($(event.currentTarget).val());
      if (tpl.dialog.selectedCardId) {
        tpl.dialog.selectedCardId.set('');
      }
    },
    'change .js-select-cards'(event: JQuery.TriggeredEvent, tpl: CardDialogInstance) {
      if (tpl.dialog.selectedCardId) {
        tpl.dialog.selectedCardId.set($(event.currentTarget).val());
      }
    },
  });
}

/** Move Card Dialog */
Template.moveCardPopup.onCreated(function (this: CardDialogInstance) {
  this.dialog = new BoardSwimlaneListCardDialog(this, {
    getDialogOptions() {
      return ReactiveCache.getCurrentUser().getMoveAndCopyDialogOptions();
    },
    async setDone(this: any, cardId: any, options: any) {
      const tpl = Template.instance();
      const title = (tpl.$('#move-card-title').val() as string).trim();
      const position = tpl.$('input[name="position"]:checked').val();

      ReactiveCache.getCurrentUser().setMoveAndCopyDialogOption(this.currentBoardId, options);
      const card = Template.currentData();
      let sortIndex = 0;

      if (cardId) {
        const targetCard = ReactiveCache.getCard(cardId);
        if (targetCard) {
          const targetSort = targetCard.sort || 0;
          if (position === 'above') {
            sortIndex = targetSort - 0.5;
          } else {
            sortIndex = targetSort + 0.5;
          }
        }
      } else {
        const maxSort = await card.getMaxSort(options.listId, options.swimlaneId);
        sortIndex = (typeof maxSort === 'number' && !Number.isNaN(maxSort)) ? maxSort + 1 : 0;
      }

      await card.move(options.boardId, options.swimlaneId, options.listId, sortIndex);
      if (title && title !== card.title) {
        await card.setTitle(title);
      }
    },
  });
});
registerCardDialogTemplate('moveCardPopup');

/** Copy Card Dialog */
Template.copyCardPopup.onCreated(function (this: CardDialogInstance) {
  this.dialog = new BoardSwimlaneListCardDialog(this, {
    getDialogOptions() {
      return ReactiveCache.getCurrentUser().getMoveAndCopyDialogOptions();
    },
    async setDone(this: any, cardId: any, options: any) {
      const tpl = Template.instance();
      const textarea = tpl.$('#copy-card-title');
      const title = (textarea.val() as string).trim();
      const position = tpl.$('input[name="position"]:checked').val();

      ReactiveCache.getCurrentUser().setMoveAndCopyDialogOption(this.currentBoardId, options);
      const card = Template.currentData();

      if (title) {
        const newCardId = await Meteor.callAsync('copyCard', card._id, options.boardId, options.swimlaneId, options.listId, true, {title: title});

        if (newCardId) {
          const newCard = ReactiveCache.getCard(newCardId);
          if (newCard) {
            let sortIndex = 0;

            if (cardId) {
              const targetCard = ReactiveCache.getCard(cardId);
              if (targetCard) {
                const targetSort = targetCard.sort || 0;
                if (position === 'above') {
                  sortIndex = targetSort - 0.5;
                } else {
                  sortIndex = targetSort + 0.5;
                }
              }
            } else {
              const maxSort = await newCard.getMaxSort(options.listId, options.swimlaneId);
              sortIndex = (typeof maxSort === 'number' && !Number.isNaN(maxSort)) ? maxSort + 1 : 0;
            }

            await newCard.move(options.boardId, options.swimlaneId, options.listId, sortIndex);
          }
        }

        // In case the filter is active we need to add the newly inserted card in
        // the list of exceptions -- cards that are not filtered. Otherwise the
        // card will disappear instantly.
        // See https://github.com/wekan/wekan/issues/80
        Filter.addException(newCardId);
      }
    },
  });
});
registerCardDialogTemplate('copyCardPopup');

/** Convert Checklist-Item to card dialog */
Template.convertChecklistItemToCardPopup.onCreated(function (this: CardDialogInstance) {
  this.dialog = new BoardSwimlaneListCardDialog(this, {
    getDialogOptions() {
      return ReactiveCache.getCurrentUser().getMoveAndCopyDialogOptions();
    },
    async setDone(this: any, cardId: any, options: any) {
      const tpl = Template.instance();
      const textarea = tpl.$('#copy-card-title');
      const title = (textarea.val() as string).trim();
      const position = tpl.$('input[name="position"]:checked').val();

      ReactiveCache.getCurrentUser().setMoveAndCopyDialogOption(this.currentBoardId, options);
      const card = Template.currentData();

      if (title) {
        const _id = Cards.insert({
          title: title,
          listId: options.listId,
          boardId: options.boardId,
          swimlaneId: options.swimlaneId,
          sort: 0,
        });
        const newCard = ReactiveCache.getCard(_id);

        let sortIndex = 0;
        if (cardId) {
          const targetCard = ReactiveCache.getCard(cardId);
          if (targetCard) {
            const targetSort = targetCard.sort || 0;
            if (position === 'above') {
              sortIndex = targetSort - 0.5;
            } else {
              sortIndex = targetSort + 0.5;
            }
          }
        } else {
          const maxSort = await newCard.getMaxSort(options.listId, options.swimlaneId);
          sortIndex = (typeof maxSort === 'number' && !Number.isNaN(maxSort)) ? maxSort + 1 : 0;
        }

        await newCard.move(options.boardId, options.swimlaneId, options.listId, sortIndex);

        Filter.addException(_id);
      }
    },
  });
});
registerCardDialogTemplate('convertChecklistItemToCardPopup');

/** Copy many cards dialog */
Template.copyManyCardsPopup.onCreated(function (this: CardDialogInstance) {
  this.dialog = new BoardSwimlaneListCardDialog(this, {
    getDialogOptions() {
      return ReactiveCache.getCurrentUser().getMoveAndCopyDialogOptions();
    },
    async setDone(this: any, cardId: any, options: any) {
      const tpl = Template.instance();
      const textarea = tpl.$('#copy-card-title');
      const title = (textarea.val() as string).trim();
      const position = tpl.$('input[name="position"]:checked').val();

      ReactiveCache.getCurrentUser().setMoveAndCopyDialogOption(this.currentBoardId, options);
      const card = Template.currentData();

      if (title) {
        const titleList = JSON.parse(title);
        for (const obj of titleList) {
          const newCardId = await Meteor.callAsync('copyCard', card._id, options.boardId, options.swimlaneId, options.listId, false, {title: obj.title, description: obj.description});

          if (newCardId) {
            const newCard = ReactiveCache.getCard(newCardId);
            let sortIndex = 0;

            if (cardId) {
              const targetCard = ReactiveCache.getCard(cardId);
              if (targetCard) {
                const targetSort = targetCard.sort || 0;
                if (position === 'above') {
                  sortIndex = targetSort - 0.5;
                } else {
                  sortIndex = targetSort + 0.5;
                }
              }
            } else {
              const maxSort = await newCard.getMaxSort(options.listId, options.swimlaneId);
              sortIndex = (typeof maxSort === 'number' && !Number.isNaN(maxSort)) ? maxSort + 1 : 0;
            }

            await newCard.move(options.boardId, options.swimlaneId, options.listId, sortIndex);
          }

          // In case the filter is active we need to add the newly inserted card in
          // the list of exceptions -- cards that are not filtered. Otherwise the
          // card will disappear instantly.
          // See https://github.com/wekan/wekan/issues/80
          Filter.addException(newCardId);
        }
      }
    },
  });
});
registerCardDialogTemplate('copyManyCardsPopup');

Template.setCardColorPopup.onCreated(function (this: ColorPopupInstance) {
  const cardId = getCardId();
  this.currentCard = Cards.findOne(cardId);
  this.currentColor = new ReactiveVar(this.currentCard?.color);
});

Template.setCardColorPopup.helpers({
  colors() {
    return ALLOWED_COLORS.map((color: any) => ({ color, name: '' }));
  },

  isSelected(color: any) {
    const tpl = Template.instance() as ColorPopupInstance;
    if (tpl.currentColor.get() === null) {
      return color === 'white';
    }
    return tpl.currentColor.get() === color;
  },
});

Template.setCardColorPopup.events({
  'click .js-palette-color'(event: JQuery.TriggeredEvent, tpl: ColorPopupInstance) {
    // Dynamic per-swatch data context holds the color value.
    const paletteData = Blaze.getData(event.currentTarget) as any;
    tpl.currentColor.set(paletteData?.color);
  },
  async 'click .js-submit'(event: JQuery.TriggeredEvent, tpl: ColorPopupInstance) {
    event.preventDefault();
    const card = Cards.findOne(getCardId());
    if (!card) return;
    await card.setColor(tpl.currentColor.get());
    Popup.back();
  },
  async 'click .js-remove-color'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    const card = Cards.findOne(getCardId());
    if (!card) return;
    await card.setColor(null);
    Popup.back();
  },
});

Template.setSelectionColorPopup.onCreated(function (this: ColorPopupInstance) {
  const selectedCards = ReactiveCache.getCards(MultiSelection.getMongoSelector());
  const uniqueColors = [...new Set(selectedCards.map((card: any) => card.color || null))];
  this.currentColor = new ReactiveVar(uniqueColors.length === 1 ? uniqueColors[0] : null);
});

Template.setSelectionColorPopup.helpers({
  colors() {
    return ALLOWED_COLORS.map((color: any) => ({ color, name: '' }));
  },

  isSelected(color: any) {
    return (Template.instance() as ColorPopupInstance).currentColor.get() === color;
  },
});

Template.setSelectionColorPopup.events({
  'click .js-palette-color'(event: JQuery.TriggeredEvent, tpl: ColorPopupInstance) {
    // Extract color from class name like "card-details-red"
    const classes = $(event.currentTarget).attr('class')!.split(' ');
    const colorClass = classes.find((cls: string) => cls.startsWith('card-details-'));
    const color = colorClass ? colorClass.replace('card-details-', '') : null;
    tpl.currentColor.set(color);
  },
  async 'submit form.edit-label'(event: JQuery.TriggeredEvent, tpl: ColorPopupInstance) {
    event.preventDefault();
    const color = tpl.currentColor.get();
    try {
      for (const card of ReactiveCache.getCards(MultiSelection.getMongoSelector())) {
        await card.setColor(color);
      }
      Popup.back();
    } catch (error) {
      alert(error?.reason || error?.message || 'Failed to save selection color');
    }
  },
  async 'click .js-submit'(event: JQuery.TriggeredEvent, tpl: ColorPopupInstance) {
    event.preventDefault();
    await tpl.$('form.edit-label').trigger('submit');
  },
  async 'click .js-remove-color'(event: JQuery.TriggeredEvent, tpl: ColorPopupInstance) {
    event.preventDefault();
    try {
      for (const card of ReactiveCache.getCards(MultiSelection.getMongoSelector())) {
        await card.setColor(null);
      }
      Popup.back();
    } catch (error) {
      alert(error?.reason || error?.message || 'Failed to unset selection color');
    }
  },
});

Template.cardMorePopup.onCreated(function (this: CardMorePopupInstance) {
  const cardId = getCardId();
  this.currentCard = Cards.findOne(cardId);
  this.parentBoard = new ReactiveVar(null);
  // #3745: tracks whether the selected parent board's cards have finished
  // loading. The card list stays empty until the subscription is ready, so it
  // is no longer blank the first time another board is picked (the cards()
  // helper queries minimongo, which was empty before the subscription arrived).
  this.parentBoardReady = new ReactiveVar(true);
  this.parentCard = this.currentCard?.parentCard();
  if (this.parentCard) {
    const list = $('.js-field-parent-card');
    list.val(this.parentCard._id);
    this.parentBoard.set(this.parentCard.board()._id);
  } else {
    this.parentBoard.set(null);
  }

  this.setParentCardId = (cardId: any) => {
    if (cardId) {
      this.parentCard = ReactiveCache.getCard(cardId);
    } else {
      this.parentCard = null;
    }
    const card = Cards.findOne(getCardId());
    if (card) card.setParentId(cardId);
  };
});

Template.cardMorePopup.helpers({
  boards() {
    const ret = ReactiveCache.getBoards(
      {
        archived: false,
        'members.userId': Meteor.userId(),
        _id: { $ne: ReactiveCache.getCurrentUser().getTemplatesBoardId() },
      },
      {
        sort: { sort: 1 /* boards default sorting */ },
      },
    );
    return ret;
  },

  cards() {
    const tpl = Template.instance() as CardMorePopupInstance;
    const currentId = getCardId();
    // #3745: don't list cards until the selected board's subscription is ready,
    // otherwise the first open shows an empty list. Depending on parentBoardReady
    // also re-runs this helper once the data has arrived.
    if (tpl.parentBoard.get() && tpl.parentBoardReady.get()) {
      const ret = ReactiveCache.getCards({
        boardId: tpl.parentBoard.get(),
        _id: { $ne: currentId },
      });
      return ret;
    } else {
      return [];
    }
  },

  isParentBoard() {
    const tpl = Template.instance() as CardMorePopupInstance;
    const board = Template.currentData();
    if (tpl.parentBoard.get()) {
      return board._id === tpl.parentBoard.get();
    }
    return false;
  },

  isParentCard() {
    const tpl = Template.instance() as CardMorePopupInstance;
    const card = Template.currentData();
    if (tpl.parentCard) {
      return card._id === tpl.parentCard;
    }
    return false;
  },
});

Template.cardMorePopup.events({
  'click .js-copy-card-link-to-clipboard'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const promise = Utils.copyTextToClipboard(location.origin + (document.getElementById('cardURL') as HTMLInputElement).value);

    const $tooltip = tpl.$('.copied-tooltip');
    Utils.showCopied(promise, $tooltip);
  },
  'click .js-delete': Popup.afterConfirm('cardDelete', function () {
    const card = Cards.findOne(getCardId());
    Popup.close();
    if (!card) return;
    // verify that there are no linked cards
    if (ReactiveCache.getCards({ linkedId: card._id }).length === 0) {
      Cards.remove(card._id);
    } else {
      // TODO: Maybe later we can list where the linked cards are.
      // Now here is popup with a hint that the card cannot be deleted
      // as there are linked cards.
      // Related:
      //   client/components/lists/listHeader.js about line 248
      //   https://github.com/wekan/wekan/issues/2785
      const message = `${TAPi18n.__(
        'delete-linked-card-before-this-card',
      )} linkedId: ${card._id
        } at client/components/cards/cardDetails.js and https://github.com/wekan/wekan/issues/2785`;
      alert(message);
    }
    Utils.goBoardId(card.boardId);
  }),
  'change .js-field-parent-board'(event: JQuery.TriggeredEvent, tpl: CardMorePopupInstance) {
    const selection = $(event.currentTarget).val();
    const list = $('.js-field-parent-card');
    if (selection === 'none') {
      tpl.parentBoard.set(null);
    } else {
      // #3745: wait for the board subscription to be ready before showing its
      // cards, so the parent-card list is populated on the first selection.
      tpl.parentBoardReady.set(false);
      Meteor.subscribe('board', selection, false, {
        onReady() {
          tpl.parentBoardReady.set(true);
        },
      });
      tpl.parentBoard.set(selection);
      list.prop('disabled', false);
    }
    tpl.setParentCardId(null);
  },
  'change .js-field-parent-card'(event: JQuery.TriggeredEvent, tpl: CardMorePopupInstance) {
    const selection = $(event.currentTarget).val();
    tpl.setParentCardId(selection);
  },
});

Template.cardStartVotingPopup.onCreated(function (this: any) {
  const cardId = getCardId();
  this.currentCard = Cards.findOne(cardId);
  this.voteQuestion = new ReactiveVar(this.currentCard?.voteQuestion);
});

Template.cardStartVotingPopup.helpers({
  getVoteQuestion() {
    const card = Cards.findOne(getCardId());
    return card && card.getVoteQuestion ? card.getVoteQuestion() : null;
  },
  votePublic() {
    const card = Cards.findOne(getCardId());
    return card && card.votePublic ? card.votePublic() : false;
  },
  voteAllowNonBoardMembers() {
    const card = Cards.findOne(getCardId());
    return card && card.voteAllowNonBoardMembers ? card.voteAllowNonBoardMembers() : false;
  },
  getVoteEnd() {
    const card = Cards.findOne(getCardId());
    return card && card.getVoteEnd ? card.getVoteEnd() : null;
  },
});

Template.cardStartVotingPopup.events({
  'click .js-end-date': Popup.open('editVoteEndDate'),
  'submit .edit-vote-question'(evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    const card = Cards.findOne(getCardId());
    if (!card) return;
    const voteQuestion = evt.target.vote.value;
    const publicVote = $('#vote-public').hasClass('is-checked');
    const allowNonBoardMembers = $('#vote-allow-non-members').hasClass(
      'is-checked',
    );
    const endString = card.getVoteEnd();
    Meteor.call('cards.setVoteQuestion', card._id, voteQuestion, publicVote, allowNonBoardMembers);
    if (endString) {
      Meteor.call('cards.setVoteEnd', card._id, new Date(endString));
    }
    Popup.back();
  },
  'click .js-remove-vote': Popup.afterConfirm('deleteVote', function () {
    const card = Cards.findOne(getCardId());
    if (!card) return;
    Meteor.call('cards.unsetVote', card._id);
    Popup.back();
  }),
  'click a.js-toggle-vote-public'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    $('#vote-public').toggleClass('is-checked');
  },
  'click a.js-toggle-vote-allow-non-members'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    $('#vote-allow-non-members').toggleClass('is-checked');
  },
});

Template.positiveVoteMembersPopup.helpers({
  voteMemberPositive() {
    const card = Cards.findOne(getCardId());
    return card ? card.voteMemberPositive() : [];
  },
});

Template.negativeVoteMembersPopup.helpers({
  voteMemberNegative() {
    const card = Cards.findOne(getCardId());
    return card ? card.voteMemberNegative() : [];
  },
});

Template.cardDeletePopup.helpers({
  archived() {
    const card = Cards.findOne(getCardId());
    return card ? card.archived : false;
  },
});

Template.cardArchivePopup.helpers({
  archived() {
    const card = Cards.findOne(getCardId());
    return card ? card.archived : false;
  },
});

// editVoteEndDatePopup
Template.editVoteEndDatePopup.onCreated(function (this: EditDatePopupInstance) {
  const card = Cards.findOne(getCardId());
  setupDatePicker(this, {
    defaultTime: formatDateTime(now()),
    initialDate: card?.getVoteEnd ? (card.getVoteEnd() || undefined) : undefined,
  });
});

Template.editVoteEndDatePopup.onRendered(function (this: EditDatePopupInstance) {
  datePickerRendered(this);
});

Template.editVoteEndDatePopup.helpers(datePickerHelpers());

Template.editVoteEndDatePopup.events(datePickerEvents({
  storeDate(this: any, date: Date) {
    Meteor.call('cards.setVoteEnd', this.datePicker.card._id, date);
  },
  deleteDate(this: any) {
    Meteor.call('cards.unsetVoteEnd', this.datePicker.card._id);
  },
}));

Template.cardStartPlanningPokerPopup.onCreated(function (this: any) {
  const cardId = getCardId();
  this.currentCard = Cards.findOne(cardId);
  this.pokerQuestion = new ReactiveVar(this.currentCard?.pokerQuestion);
});

Template.cardStartPlanningPokerPopup.helpers({
  getPokerQuestion() {
    const card = Cards.findOne(getCardId());
    return card && card.getPokerQuestion ? card.getPokerQuestion() : null;
  },
  pokerAllowNonBoardMembers() {
    const card = Cards.findOne(getCardId());
    return card && card.pokerAllowNonBoardMembers ? card.pokerAllowNonBoardMembers() : false;
  },
  getPokerEnd() {
    const card = Cards.findOne(getCardId());
    return card && card.getPokerEnd ? card.getPokerEnd() : null;
  },
});

Template.cardStartPlanningPokerPopup.events({
  'click .js-end-date': Popup.open('editPokerEndDate'),
  'submit .edit-poker-question'(evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    const card = Cards.findOne(getCardId());
    if (!card) return;
    const pokerQuestion = true;
    const allowNonBoardMembers = $('#poker-allow-non-members').hasClass(
      'is-checked',
    );
    const endString = card.getPokerEnd();

    Meteor.call('cards.setPokerQuestion', card._id, pokerQuestion, allowNonBoardMembers);
    if (endString) {
      Meteor.call('cards.setPokerEnd', card._id, new Date(endString));
    }
    Popup.back();
  },
  'click .js-remove-poker': Popup.afterConfirm('deletePoker', function () {
    const card = Cards.findOne(getCardId());
    if (!card) return;
    Meteor.call('cards.unsetPoker', card._id);
    Popup.back();
  }),
  'click a.js-toggle-poker-allow-non-members'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    $('#poker-allow-non-members').toggleClass('is-checked');
  },
});

// editPokerEndDatePopup
Template.editPokerEndDatePopup.onCreated(function (this: EditDatePopupInstance) {
  const card = Cards.findOne(getCardId());
  setupDatePicker(this, {
    defaultTime: formatDateTime(now()),
    initialDate: card?.getPokerEnd ? (card.getPokerEnd() || undefined) : undefined,
  });
});

Template.editPokerEndDatePopup.onRendered(function (this: EditDatePopupInstance) {
  datePickerRendered(this);
});

Template.editPokerEndDatePopup.helpers(datePickerHelpers());

Template.editPokerEndDatePopup.events(datePickerEvents({
  storeDate(this: any, date: Date) {
    Meteor.call('cards.setPokerEnd', this.datePicker.card._id, date);
  },
  deleteDate(this: any) {
    Meteor.call('cards.unsetPokerEnd', this.datePicker.card._id);
  },
}));

// Close the card details pane by pressing escape
EscapeActions.register(
  'detailsPane',
  async () => {
    // if card description diverges from database due to editing
    // ask user whether changes should be applied
    if (ReactiveCache.getCurrentUser()) {
      if (ReactiveCache.getCurrentUser().profile.rescueCardDescription == true) {
        const currentCard = getCurrentCardFromContext();
        const cardDetailsElement = getCardDetailsElement(currentCard?._id);
        const currentDescription = cardDetailsElement?.querySelector(
          '.editor.js-new-description-input',
        ) as HTMLInputElement | null | undefined;
        if (currentDescription?.value && currentCard && !(currentDescription.value === currentCard.getDescription())) {
          if (confirm(TAPi18n.__('rescue-card-description-dialogue'))) {
            await currentCard.setDescription(currentDescription.value);
            // Save it!
            console.log(currentDescription.value);
            console.log("current description", currentCard.getDescription());
          } else {
            // Do nothing!
            console.log('Description changes were not saved to the database.');
          }
        }
      }
    }
    // #5686: selecting the text of a checklist item (whose mousedown stops
    // propagation, so cardDetailsIsDragging is never set) and releasing the
    // mouse outside the card must NOT close the card. Treat a live text
    // selection anchored inside the card pane the same as an in-card drag.
    const selectingInsideCard = isTextSelectionInsideCard(
      typeof window !== 'undefined' && window.getSelection
        ? window.getSelection()
        : null,
      // A real DOM Element satisfies cardCloseGuard's DOM-light shape; the cast
      // bridges the intentionally narrow { contains? } interface it expects.
      getCardDetailsElement(getCurrentCardFromContext()?._id) as { contains?: (node: object | null) => boolean } | null,
    );
    if (Session.get('cardDetailsIsDragging') || selectingInsideCard) {
      // Reset dragging status as the mouse landed outside the cardDetails template area and this will prevent a mousedown event from firing
      Session.set('cardDetailsIsDragging', false);
      Session.set('cardDetailsIsMouseDown', false);

    } else {
      // Trigger the close button so all close logic (openCards, routing, mini-screen) runs consistently
      $('.js-close-card-details').first().trigger('click');
    }
  },
  () => {
    return !Session.equals('currentCard', null);
  },
  {
    noClickEscapeOn: '.js-card-details,.board-sidebar,#header',
  },
);

Template.cardAssigneesPopup.onCreated(function (this: MembersReactivePopupInstance) {
  let currBoard = Utils.getCurrentBoard();
  let members = currBoard.activeMembers();
  this.members = new ReactiveVar(members);
});

Template.cardAssigneesPopup.events({
  'click .js-select-assignee'(this: any, event: JQuery.TriggeredEvent) {
    const card = getCurrentCardFromContext();
    if (!card) return;
    const assigneeId = this.userId;
    card.toggleAssignee(assigneeId);
    event.preventDefault();
  },
  'keyup .card-assignees-filter'(event: JQuery.TriggeredEvent) {
    const members = filterMembers(event.target.value);
    (Template.instance() as MembersReactivePopupInstance).members.set(members);
  },
});

Template.cardAssigneesPopup.helpers({
  isCardAssignee(this: any) {
    const card = getCurrentCardFromContext();
    if (!card) return false;
    const cardAssignees = card.getAssignees();

    return (cardAssignees || []).includes(this.userId);
  },

  members() {
    const members = (Template.instance() as MembersReactivePopupInstance).members.get();
    const uniqueMembers = uniqBy(members, 'userId');
    return [...uniqueMembers].sort((a: any, b: any) => {
      const userA = ReactiveCache.getUser(a.userId);
      const userB = ReactiveCache.getUser(b.userId);
      const nameA = userA ? userA.profile.fullname : '';
      const nameB = userB ? userB.profile.fullname : '';
      return nameA.localeCompare(nameB);
    });
  },

  userData(this: any) {
    return ReactiveCache.getUser(this.userId);
  },
});

Template.cardAssigneePopup.helpers({
  userData(this: any) {
    return ReactiveCache.getUser(this.userId, {
      fields: {
        profile: 1,
        username: 1,
      },
    });
  },

  memberType(this: any) {
    const user = ReactiveCache.getUser(this.userId);
    return user && user.isBoardAdmin() ? 'admin' : 'normal';
  },

  isCardAssignee(this: any) {
    const card = getCurrentCardFromContext();
    if (!card) return false;
    const cardAssignees = card.getAssignees();

    return (cardAssignees || []).includes(this.userId);
  },

  user(this: any) {
    return ReactiveCache.getUser(this.userId);
  },
});

Template.cardAssigneePopup.events({
  'click .js-remove-assignee'(this: any) {
    ReactiveCache.getCard(this.cardId).unassignAssignee(this.userId);
    Popup.back();
  },
  'click .js-edit-profile': Popup.open('editProfile'),
});

// #3392: PI Program Board "Red Strings". Popup to pick another card on the
// same board to add as a dependency. The popup's data context is the source
// card (set by Popup.open on the .js-add-dependency element inside cardDetails).
Template.cardDependenciesPopup.onCreated(function (this: DependenciesPopupInstance) {
  this.searchTerm = new ReactiveVar('');
  this.newType = new ReactiveVar(DEPENDENCY_TYPES[0].id);
  this.newColor = new ReactiveVar(DEFAULT_DEPENDENCY_COLOR);
});

Template.cardDependenciesPopup.helpers({
  defaultColor() {
    return (Template.instance() as DependenciesPopupInstance).newColor.get();
  },
  typeOption() {
    const current = (Template.instance() as DependenciesPopupInstance).newType.get();
    return DEPENDENCY_TYPES.map(t => ({
      id: t.id,
      label: `dependency-type-${t.id}`,
      selected: t.id === current,
    }));
  },
  candidateCards() {
    const sourceCard = Template.currentData();
    if (!sourceCard) return [];
    const term = (Template.instance() as DependenciesPopupInstance).searchTerm.get().toLowerCase();
    const existingIds = (sourceCard.getDependencies
      ? sourceCard.getDependencies()
      : []
    ).map((dep: any) => dep.cardId);
    const cards = ReactiveCache.getCards({
      boardId: sourceCard.boardId,
      archived: false,
    });
    return cards.filter((card: any) => {
      if (card._id === sourceCard._id) return false;
      if (existingIds.includes(card._id)) return false;
      if (term && !(card.title || '').toLowerCase().includes(term)) return false;
      return true;
    });
  },
});

Template.cardDependenciesPopup.events({
  'keyup .js-dependency-search'(event: JQuery.TriggeredEvent) {
    (Template.instance() as DependenciesPopupInstance).searchTerm.set(event.currentTarget.value || '');
  },
  'change .js-new-dependency-type'(event: JQuery.TriggeredEvent) {
    (Template.instance() as DependenciesPopupInstance).newType.set(event.currentTarget.value);
  },
  'change .js-new-dependency-color'(event: JQuery.TriggeredEvent) {
    (Template.instance() as DependenciesPopupInstance).newColor.set(event.currentTarget.value);
  },
  'click .js-pick-dependency'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    const tpl = Template.instance() as DependenciesPopupInstance;
    const sourceCard = Template.currentData();
    const targetId = event.currentTarget.dataset.targetId;
    if (sourceCard && targetId) {
      sourceCard.addDependency(targetId, {
        type: tpl.newType.get(),
        color: tpl.newColor.get(),
      });
    }
    Popup.back();
  },
});

// #3392: icon picker for an existing dependency. The source card is the popup's
// data context; the target id was stashed on the cardDetails instance by the
// .js-dependency-icon click handler.
Template.cardDependencyIconPopup.helpers({
  dependencyIcons() {
    return DEPENDENCY_ICON_CHOICES.map((name: any) => ({ name }));
  },
});

Template.cardDependencyIconPopup.events({
  'click .js-pick-dependency-icon'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    // Use the source card captured when the picker was opened (the popup's own
    // data context is the dependency row, which has no setDependencyProps).
    const sourceCard = editingDependencyCard;
    const icon = event.currentTarget.dataset.icon || DEFAULT_DEPENDENCY_ICON;
    if (sourceCard && editingDependencyTargetId) {
      sourceCard.setDependencyProps(editingDependencyTargetId, { icon });
    }
    editingDependencyTargetId = null;
    editingDependencyCard = null;
    Popup.back();
  },
});

// Coordinates (and optional place name / address) extracted from a map link.
interface ParsedMapLink {
  latitude?: number;
  longitude?: number;
  name?: string;
  address?: string;
}

interface CardDetailsInstance extends Blaze.TemplateInstance {
  // Board doc for the card; used to read presentParentTask.
  currentBoard: any;
  isLoaded: ReactiveVar<boolean>;
  infiniteScrolling: InfiniteScrolling;
  calculateNextPeak: () => void;
  reachNextPeak: () => void;
}

interface ExportCardPopupInstance extends Blaze.TemplateInstance {
  excelFields: ReactiveDict<Record<string, boolean>>;
}

interface InlinedCardDescriptionInstance extends Blaze.TemplateInstance {
  isOpen: ReactiveVar<boolean>;
  // The following mirror the inlinedForm helper contract used at runtime.
  _getUnsavedEditKey: () => any;
  _getValue: () => any;
  _close: (isReset?: boolean) => void;
  _reset: () => void;
}

interface FilterTermPopupInstance extends Blaze.TemplateInstance {
  filterTerm: ReactiveVar<string>;
}

interface CardLocationsPopupInstance extends Blaze.TemplateInstance {
  // Card id resolved from the popup's data context.
  cardId: any;
  detectMsg: ReactiveVar<string>;
  mapSavedMsg: ReactiveVar<string>;
}

interface CardDialogInstance extends Blaze.TemplateInstance {
  // BoardSwimlaneListCardDialog instance (untyped helper class).
  dialog: any;
}

interface ColorPopupInstance extends Blaze.TemplateInstance {
  // Selected color reactive var; holds a color string or null.
  currentColor: ReactiveVar<any>;
  // Card doc when editing a single card's color.
  currentCard?: any;
}

interface CardMorePopupInstance extends Blaze.TemplateInstance {
  // Card doc for the open card.
  currentCard: any;
  // Selected parent board id (or null).
  parentBoard: ReactiveVar<any>;
  parentBoardReady: ReactiveVar<boolean>;
  // Parent card doc (or null).
  parentCard: any;
  setParentCardId: (cardId: any) => void;
}

interface MembersReactivePopupInstance extends Blaze.TemplateInstance {
  // Reactive list of board members (active member docs).
  members: ReactiveVar<any>;
}

interface DependenciesPopupInstance extends Blaze.TemplateInstance {
  searchTerm: ReactiveVar<string>;
  // Selected dependency type/color values.
  newType: ReactiveVar<any>;
  newColor: ReactiveVar<any>;
}

interface EditDatePopupInstance extends Blaze.TemplateInstance {
  // Shared datepicker state attached by setupDatePicker.
  datePicker: any;
}
