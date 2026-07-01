import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { ReactiveCache } from '/imports/reactiveCache';
import { TrelloCreator } from './trelloCreator';
import { WekanCreator } from './wekanCreator';
import { CsvCreator } from './csvCreator';
import { JiraCreator } from './jiraCreator';
import { KanboardCreator } from './kanboardCreator';
import { EXTERNAL_PARSERS } from './lib/externalParsers';
import { Exporter } from './exporter';
import { getMembersToMap } from './wekanmapper';

// Parse an uploaded .xlsx (base64) into the row-array shape the CsvCreator
// consumes (board[0] is the header row). Excel import reuses the CSV creator.
async function parseXlsxToRows(excelBase64: string) {
  // eslint-disable-next-line global-require
  const ExcelJS = require('@wekanteam/exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(excelBase64, 'base64'));
  const worksheet = workbook.worksheets[0];
  const rows: any[] = [];
  if (worksheet) {
    // `row` is an exceljs Row (untyped require), hence `any`.
    worksheet.eachRow((row: any) => {
      // row.values is 1-indexed (index 0 is empty); normalize to strings.
      rows.push(row.values.slice(1).map((v: any) => (v == null ? '' : String(v))));
    });
  }
  return rows;
}

Meteor.methods({
  async importBoard(board, data, importSource, currentBoard) {
    check(data, Object);
    check(importSource, String);
    check(currentBoard, Match.Maybe(String));
    let creator;
    let importedBoard = board;
    switch (importSource) {
      case 'trello':
        check(board, Object);
        creator = new TrelloCreator(data);
        break;
      case 'wekan':
        check(board, Object);
        creator = new WekanCreator(data);
        break;
      case 'csv':
        check(board, Array);
        creator = new CsvCreator(data);
        break;
      case 'jira':
        check(board, Object);
        creator = new JiraCreator(data);
        break;
      case 'kanboard':
        check(board, Object);
        creator = new KanboardCreator(data);
        break;
      case 'excel':
        // board = { excelBase64 }; parse it into rows and reuse the CSV creator.
        check(board, Object);
        // `board` was narrowed to `object` by check(); the excel payload holds
        // a dynamic `excelBase64` field, read through `any`.
        importedBoard = await parseXlsxToRows((board as any).excelBase64);
        creator = new CsvCreator(data);
        break;
      default:
        // NextCloud Deck / OpenProject / GitHub / GitLab / Gitea / Forgejo:
        // normalize the platform's JSON to the common Kanboard shape and reuse
        // the Kanboard creator.
        const externalParser = (EXTERNAL_PARSERS as Record<string, (board: any) => any>)[importSource];
        if (externalParser) {
          check(board, Match.OneOf(Object, Array));
          importedBoard = externalParser(board);
          creator = new KanboardCreator(data);
        }
        break;
    }
    if (!creator) {
      throw new Meteor.Error('invalid-import-source', `Unknown import source: ${importSource}`);
    }

    // 1. check all parameters are ok from a syntax point of view
    //creator.check(board);

    // 2. check parameters are ok from a business point of view (exist &
    // authorized) nothing to check, everyone can import boards in their account

    // 3. create all elements
    return await creator.create(importedBoard, currentBoard);
  },
});

Meteor.methods({
  async cloneBoard(sourceBoardId, currentBoardId) {
    check(sourceBoardId, String);
    check(currentBoardId, Match.Maybe(String));

    // Authorization: a caller may only clone (which reads the entire board)
    // a source board they are allowed to see. Without this check any
    // authenticated user could clone an arbitrary private board by ID.
    // We reuse the same guard the REST export route uses (canExport ->
    // board.isVisibleBy), since cloning exposes the same data as an export.
    if (!this.userId) {
      throw new Meteor.Error('error-notAuthorized');
    }
    const exporter = new Exporter(sourceBoardId);
    const user = await ReactiveCache.getUser(this.userId);
    if (!user || !(await exporter.canExport(user))) {
      throw new Meteor.Error('error-notAuthorized');
    }

    const data = await exporter.build();
    const additionalData: { [key: string]: any } = {};

    //get the members to map
    // NOTE: getMembersToMap is async, but this call is intentionally left
    // un-awaited to preserve the existing runtime behavior; typed `any` so the
    // pre-existing usage below compiles.
    const membersMapping: any = getMembersToMap(data);

    //now mirror the mapping done in finishImport in client/components/import/import.js:
    if (membersMapping) {
      const mappingById: { [key: string]: any } = {};
      membersMapping.forEach((member: any) => {
        if (member.wekanId) {
          mappingById[member.id] = member.wekanId;
        }
      });
      additionalData.membersMapping = mappingById;
    }

    const creator = new WekanCreator(additionalData);
    //data.title = `${data.title  } - ${  TAPi18n.__('copy-tag')}`;
    data.title = `${data.title}`;
    return await creator.create(data, currentBoardId);
  },
});
