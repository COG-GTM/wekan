import { Meteor } from 'meteor/meteor';
import Translation from '/models/translation';
import { ensureIndex } from '/server/lib/mongoStartup';

const getReactiveCache = () => require('/imports/reactiveCache').ReactiveCache;

Meteor.methods({
  async setCreateTranslation(language: string, text: string, translationText: string) {
    check(language, String);
    check(text, String);
    check(translationText, String);

    if (!(await getReactiveCache().getCurrentUser())?.isAdmin) {
      throw new Meteor.Error('not-authorized');
    }

    const nTexts = (await getReactiveCache().getTranslations({ language, text })).length;
    if (nTexts > 0) {
      throw new Meteor.Error('text-already-taken');
    }

    await Translation.insertAsync({
      language,
      text,
      translationText,
    });
  },

  async setTranslationText(translation: WekanDocumentField, translationText: string) {
    check(translation, Object);
    check(translationText, String);

    if (!(await getReactiveCache().getCurrentUser())?.isAdmin) {
      throw new Meteor.Error('not-authorized');
    }

    await Translation.updateAsync(translation, {
      $set: { translationText },
    });
  },

  async deleteTranslation(translationId: string) {
    check(translationId, String);

    if (!(await getReactiveCache().getCurrentUser())?.isAdmin) {
      throw new Meteor.Error('not-authorized');
    }

    await Translation.removeAsync(translationId);
  },
});

Meteor.startup(async () => {
  await ensureIndex(Translation, { modifiedAt: -1 });
});
