import { Meteor } from 'meteor/meteor';
import { ReactiveCache } from '/imports/reactiveCache';
import { isEmptyObject } from 'jquery';
import Activities from '/models/activities';
import Boards from './boards';
import Cards from '/models/cards';
import CustomFields from '/models/customFields';
import Lists from '/models/lists';
import Swimlanes from '/models/swimlanes';

export class CsvCreator {
  private _nowDate: Date;
  private fieldIndex: CsvFieldIndex;
  private lists: Record<string, string>;
  private members: Record<string, string>;
  private swimlane: string | null;

  constructor(data: CsvCreatorData) {
    // date to be used for timestamps during import
    this._nowDate = new Date();
    // index to help keep track of what information a column stores
    // each row represents a card
    this.fieldIndex = { customFields: [] };
    this.lists = {};
    // Map of members using username => wekanid
    this.members = data.membersMapping ? data.membersMapping : {};
    this.swimlane = null;
  }

  /**
   * If dateString is provided,
   * return the Date it represents.
   * If not, will return the date when it was first called.
   * This is useful for us, as we want all import operations to
   * have the exact same date for easier later retrieval.
   *
   * @param {String} dateString a properly formatted Date
   */
  _now(dateString?: string | Date) {
    if (dateString) {
      return new Date(dateString);
    }
    if (!this._nowDate) {
      this._nowDate = new Date();
    }
    return this._nowDate;
  }

  _user(wekanUserId?: string) {
    if (wekanUserId && this.members[wekanUserId]) {
      return this.members[wekanUserId];
    }
    return Meteor.userId();
  }

  /**
   * Map the header row titles to an index to help assign proper values to the cards' fields
   * Valid headers (name of card fields):
   * title, description, status, owner, member, label, due date, start date, finish date, created at, updated at
   * Some header aliases can also be accepted.
   * Headers are NOT case-sensitive.
   *
   * @param {Array} headerRow array from row of headers of imported CSV/TSV for cards
   */
  mapHeadertoCardFieldIndex(headerRow: string[]) {
    const index: CsvFieldIndex = { customFields: [] };
    for (let i = 0; i < headerRow.length; i++) {
      switch (headerRow[i].trim().toLowerCase()) {
        case 'title':
          index.title = i;
          break;
        case 'description':
          index.description = i;
          break;
        case 'stage':
        case 'status':
        case 'state':
          index.stage = i;
          break;
        case 'owner':
          index.owner = i;
          break;
        case 'members':
        case 'member':
          index.members = i;
          break;
        case 'labels':
        case 'label':
          index.labels = i;
          break;
        case 'due date':
        case 'deadline':
        case 'due at':
          index.dueAt = i;
          break;
        case 'start date':
        case 'start at':
          index.startAt = i;
          break;
        case 'finish date':
        case 'end at':
          index.endAt = i;
          break;
        case 'creation date':
        case 'created at':
          index.createdAt = i;
          break;
        case 'update date':
        case 'updated at':
        case 'modified at':
        case 'modified on':
          index.modifiedAt = i;
          break;
      }
      if (headerRow[i].toLowerCase().startsWith('customfield')) {
        if (headerRow[i].split('-')[2] === 'dropdown') {
          index.customFields.push({
            name: headerRow[i].split('-')[1],
            type: headerRow[i].split('-')[2],
            options: headerRow[i].split('-')[3].split('/'),
            position: i,
          });
        } else if (headerRow[i].split('-')[2] === 'currency') {
          index.customFields.push({
            name: headerRow[i].split('-')[1],
            type: headerRow[i].split('-')[2],
            currencyCode: headerRow[i].split('-')[3],
            position: i,
          });
        } else {
          index.customFields.push({
            name: headerRow[i].split('-')[1],
            type: headerRow[i].split('-')[2],
            position: i,
          });
        }
      }
    }
    this.fieldIndex = index;
  }
  async createCustomFields(boardId: string) {
    for (const customField of this.fieldIndex.customFields) {
      let settings = {};
      if (customField.type === 'dropdown') {
        settings = {
          dropdownItems: customField.options!.map(option => {
            return { _id: Random.id(6), name: option };
          }),
        };
      } else if (customField.type === 'currency') {
        settings = {
          currencyCode: customField.currencyCode,
        };
      } else {
        settings = {};
      }
      const id = await CustomFields.direct.insertAsync({
        name: customField.name,
        type: customField.type,
        settings,
        showOnCard: false,
        automaticallyOnCard: false,
        alwaysOnCard: false,
        showLabelOnMiniCard: false,
        boardIds: [boardId],
      });
      customField.id = id;
      customField.settings = settings;
    }
  }

  async createBoard(csvData: WekanDocumentField[]) {
    const boardToCreate: ImportBoardToCreate = {
      archived: false,
      color: 'belize',
      createdAt: this._now(),
      labels: [],
      members: [
        {
          userId: Meteor.userId(),
          wekanId: Meteor.userId(),
          isActive: true,
          isAdmin: true,
          isNoComments: false,
          isCommentOnly: false,
          swimlaneId: false,
        },
      ],
      modifiedAt: this._now(),
      //default is private, should inform user.
      permission: 'private',
      slug: 'board',
      stars: 0,
      title: `Imported Board ${this._now()}`,
    };

    // create labels
    const labelsToCreate = new Set<string>();
    for (let i = 1; i < csvData.length; i++) {
      if (csvData[i][this.fieldIndex.labels as number]) {
        for (const importedLabel of csvData[i][this.fieldIndex.labels as number].split(
          ' ',
        )) {
          if (importedLabel && importedLabel.length > 0) {
            labelsToCreate.add(importedLabel);
          }
        }
      }
    }
    for (const label of labelsToCreate) {
      let labelName, labelColor;
      if (label.indexOf('-') > -1) {
        labelName = label.split('-')[0];
        labelColor = label.split('-')[1];
      } else {
        labelName = label;
      }
      const labelToCreate = {
        _id: Random.id(6),
        color: labelColor ? labelColor : 'black',
        name: labelName,
      };
      boardToCreate.labels.push(labelToCreate);
    }

    const boardId = await Boards.direct.insertAsync(boardToCreate);
    await Boards.direct.updateAsync(boardId, {
      $set: {
        modifiedAt: this._now(),
      },
    });
    // log activity
    await Activities.direct.insertAsync({
      activityType: 'importBoard',
      boardId,
      createdAt: this._now(),
      source: {
        id: boardId,
        system: 'CSV/TSV',
      },
      // We attribute the import to current user,
      // not the author from the original object.
      userId: this._user(),
    });
    return boardId;
  }

  async createSwimlanes(boardId: string) {
    const swimlaneToCreate = {
      archived: false,
      boardId,
      createdAt: this._now(),
      title: 'Default',
      sort: 1,
    };
    const swimlaneId = await Swimlanes.direct.insertAsync(swimlaneToCreate);
    await Swimlanes.direct.updateAsync(swimlaneId, { $set: { updatedAt: this._now() } });
    this.swimlane = swimlaneId;
  }

  async createLists(csvData: WekanDocumentField[], boardId: string) {
    let numOfCreatedLists = 0;
    for (let i = 1; i < csvData.length; i++) {
      const listToCreate: { archived: boolean; boardId: string; createdAt: Date; title?: WekanDocumentField } = {
        archived: false,
        boardId,
        createdAt: this._now(),
      };
      if (csvData[i][this.fieldIndex.stage as number]) {
        const existingList = await ReactiveCache.getLists({
          title: csvData[i][this.fieldIndex.stage as number],
          boardId,
        });
        if (existingList.length > 0) {
          continue;
        } else {
          listToCreate.title = csvData[i][this.fieldIndex.stage as number];
        }
      } else listToCreate.title = `Imported List ${this._now()}`;

      const listId = await Lists.direct.insertAsync(listToCreate);
      this.lists[csvData[i][this.fieldIndex.stage as number]] = listId;
      numOfCreatedLists++;
      await Lists.direct.updateAsync(listId, {
        $set: {
          updatedAt: this._now(),
          sort: numOfCreatedLists,
        },
      });
    }
  }

  async createCards(csvData: WekanDocumentField[], boardId: string) {
    for (let i = 1; i < csvData.length; i++) {
      const cardToCreate: ImportCardToCreate = {
        archived: false,
        boardId,
        dateLastActivity: this._now(),
        description: csvData[i][this.fieldIndex.description as number],
        listId: this.lists[csvData[i][this.fieldIndex.stage as number]],
        swimlaneId: this.swimlane,
        sort: -1,
        title: csvData[i][this.fieldIndex.title as number],
        userId: this._user(),
        spentTime: null,
        labelIds: [],
      };
      // Date columns are optional: only set them when the column exists for this
      // row and is non-empty (this.fieldIndex.<x> is undefined when the column is
      // absent, so the cell lookup yields undefined).
      const createdAtCell = csvData[i][this.fieldIndex.createdAt as number];
      if (createdAtCell && createdAtCell.length !== 0) {
        cardToCreate.createdAt = this._now(new Date(createdAtCell));
      }
      const startAtCell = csvData[i][this.fieldIndex.startAt as number];
      if (startAtCell && startAtCell.length !== 0) {
        cardToCreate.startAt = this._now(new Date(startAtCell));
      }
      const dueAtCell = csvData[i][this.fieldIndex.dueAt as number];
      if (dueAtCell && dueAtCell.length !== 0) {
        cardToCreate.dueAt = this._now(new Date(dueAtCell));
      }
      const endAtCell = csvData[i][this.fieldIndex.endAt as number];
      if (endAtCell && endAtCell.length !== 0) {
        cardToCreate.endAt = this._now(new Date(endAtCell));
      }
      const modifiedAtCell = csvData[i][this.fieldIndex.modifiedAt as number];
      if (modifiedAtCell && modifiedAtCell.length !== 0) {
        cardToCreate.modifiedAt = this._now(new Date(modifiedAtCell));
      }
      // add the labels
      if (csvData[i][this.fieldIndex.labels as number]) {
        const board = await ReactiveCache.getBoard(boardId);
        for (const importedLabel of csvData[i][this.fieldIndex.labels as number].split(
          ' ',
        )) {
          if (importedLabel && importedLabel.length > 0) {
            let labelToApply;
            if (importedLabel.indexOf('-') === -1) {
              labelToApply = board.getLabel(importedLabel, 'black');
            } else {
              labelToApply = board.getLabel(
                importedLabel.split('-')[0],
                importedLabel.split('-')[1],
              );
            }
            cardToCreate.labelIds.push(labelToApply._id);
          }
        }
      }
      // add the members
      if (csvData[i][this.fieldIndex.members as number]) {
        const wekanMembers: string[] = [];
        for (const importedMember of csvData[i][this.fieldIndex.members as number].split(
          ' ',
        )) {
          if (this.members[importedMember]) {
            const wekanId = this.members[importedMember];
            if (!wekanMembers.find(wId => wId === wekanId)) {
              wekanMembers.push(wekanId);
            }
          }
        }
        if (wekanMembers.length > 0) {
          cardToCreate.members = wekanMembers;
        }
      }
      // add the custom fields
      if (this.fieldIndex.customFields.length > 0) {
        const customFields: Array<{ _id?: string; value: WekanDocumentField }> = [];
        this.fieldIndex.customFields.forEach(customField => {
          if (csvData[i][customField.position] !== ' ') {
            if (customField.type === 'dropdown') {
              customFields.push({
                _id: customField.id,
                value: customField.settings.dropdownItems.find(
                  ({ name }: WekanDocumentField) => name === csvData[i][customField.position],
                )._id,
              });
            } else {
              customFields.push({
                _id: customField.id,
                value: csvData[i][customField.position],
              });
            }
          }
          cardToCreate.customFields = customFields;
        });
      }
      await Cards.direct.insertAsync(cardToCreate);
    }
  }

  async create(board: WekanDocumentField[], currentBoardId?: string) {
    const isSandstorm =
      Meteor.settings &&
      Meteor.settings.public &&
      Meteor.settings.public.sandstorm;
    if (isSandstorm && currentBoardId) {
      const currentBoard = await ReactiveCache.getBoard(currentBoardId);
      await currentBoard.archive();
    }
    this.mapHeadertoCardFieldIndex(board[0]);
    const boardId = await this.createBoard(board);
    await this.createLists(board, boardId);
    await this.createSwimlanes(boardId);
    await this.createCustomFields(boardId);
    await this.createCards(board, boardId);
    return boardId;
  }
}

// The extra import payload (member id -> wekan user id map) passed to the
// creator; its concrete shape is the untyped Meteor method argument.
interface CsvCreatorData {
  membersMapping?: Record<string, string>;
  [key: string]: WekanDocumentField;
}

// A CustomField column parsed from the CSV header row.
interface CsvCustomFieldColumn {
  name: string;
  type: string;
  position: number;
  options?: string[];
  currencyCode?: string;
  id?: string;
  settings?: WekanDocumentField;
}

// Map of card-field name -> column index, built from the CSV header row.
interface CsvFieldIndex {
  title?: number;
  description?: number;
  stage?: number;
  owner?: number;
  members?: number;
  labels?: number;
  dueAt?: number;
  startAt?: number;
  endAt?: number;
  createdAt?: number;
  modifiedAt?: number;
  customFields: CsvCustomFieldColumn[];
}

interface ImportBoardLabel {
  _id: string;
  color: string;
  name: string;
}

interface ImportBoardMember {
  userId: string | null;
  wekanId: string | null;
  isActive: boolean;
  isAdmin: boolean;
  isNoComments: boolean;
  isCommentOnly: boolean;
  swimlaneId: boolean;
}

interface ImportBoardToCreate {
  archived: boolean;
  color: string;
  createdAt: Date;
  labels: ImportBoardLabel[];
  members: ImportBoardMember[];
  modifiedAt: Date;
  permission: string;
  slug: string;
  stars: number;
  title: string;
}

interface ImportCardToCreate {
  archived: boolean;
  boardId: string;
  dateLastActivity: Date;
  description: WekanDocumentField;
  listId: string;
  swimlaneId: string | null;
  sort: number;
  title: WekanDocumentField;
  userId: string | null;
  spentTime: number | null;
  labelIds: string[];
  createdAt?: Date;
  startAt?: Date;
  dueAt?: Date;
  endAt?: Date;
  modifiedAt?: Date;
  members?: string[];
  customFields?: WekanDocumentField[];
}
