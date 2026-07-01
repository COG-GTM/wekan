
Meteor.loginWithCas = function(callback?: (err?: Error) => void) {

  var credentialToken = Random.id();

  // `Meteor.settings.public` is a dynamic settings dictionary; the cast keeps
  // the chained `.cas` accesses typed instead of narrowing to `never`.
  if (!(Meteor.settings.public as { [key: string]: any }) &&
      !Meteor.settings.public.cas &&
      !Meteor.settings.public.cas.loginUrl) {
    return;
  }

  var settings = Meteor.settings.public.cas;

  var loginUrl = settings.loginUrl +
      "?" + (settings.service || "service") + "=" +
      Meteor.absoluteUrl('_cas/') +
      credentialToken;


  var fail = function (err: InAppBrowserEvent) {
    Meteor._debug("Error from OAuth popup: " + JSON.stringify(err));
  };

  // When running on an android device, we sometimes see the
  // `pageLoaded` callback fire twice for the final page in the OAuth
  // popup, even though the page only loads once. This is maybe an
  // Android bug or maybe something intentional about how onPageFinished
  // works that we don't understand and isn't well-documented.
  var oauthFinished = false;

  var pageLoaded = function (event: InAppBrowserEvent) {
    if (oauthFinished) {
      return;
    }

    if (event.url.indexOf(Meteor.absoluteUrl('_cas')) === 0) {

      oauthFinished = true;

      // On iOS, this seems to prevent "Warning: Attempt to dismiss from
      // view controller <MainViewController: ...> while a presentation
      // or dismiss is in progress". My guess is that the last
      // navigation of the OAuth popup is still in progress while we try
      // to close the popup. See
      // https://issues.apache.org/jira/browse/CB-2285.
      //
      // XXX Can we make this timeout smaller?
      setTimeout(function () {
        popup.close();
        // check auth on server.
        Accounts.callLoginMethod({
          methodArguments: [{ cas: { credentialToken: credentialToken } }],
          userCallback: callback
        });
      }, 100);
    }
  };

  var onExit = function () {
    popup.removeEventListener('loadstop', pageLoaded);
    popup.removeEventListener('loaderror', fail);
    popup.removeEventListener('exit', onExit);
  };

  // any: Cordova's InAppBrowser plugin replaces `window.open` at runtime,
  // returning an InAppBrowser instance (not a DOM Window) whose type is not
  // available here; only the members used below (see InAppBrowserEvent) matter.
  var popup: any = window.open(loginUrl, '_blank', 'location=no,hidden=no');
  popup.addEventListener('loadstop', pageLoaded);
  popup.addEventListener('loaderror', fail);
  popup.addEventListener('exit', onExit);
  popup.show();

};

interface InAppBrowserEvent {
  type: string;
  url: string;
  code?: number;
  message?: string;
}
