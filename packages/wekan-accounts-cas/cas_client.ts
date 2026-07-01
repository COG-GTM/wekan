
function addParameterToURL(url: string, param: string){
  var urlSplit = url.split('?');
  return url+(urlSplit.length>0 ? '?':'&') + param;
}

Meteor.initCas = function(callback?: (err?: Error) => void) {
    const casTokenMatch = window.location.href.match(/[?&]casToken=([^&]+)/);
    if (casTokenMatch == null) {
        return;
    }

    window.history.pushState('', document.title, window.location.href.replace(/([&?])casToken=[^&]+[&]?/, '$1').replace(/[?&]+$/g, ''));

    Accounts.callLoginMethod({
        methodArguments: [{ cas: { credentialToken: casTokenMatch[1] } }],
        userCallback: function(err){
            if (err == null) {
                // should we do anything on success?
            }
            if (callback != null) {
                callback(err);
            }
        }
    });
}

Meteor.loginWithCas = function(options?: LoginWithCasOptions | null, callback?: (err?: Error) => void) {

    var credentialToken = Random.id();

    // `Meteor.settings.public` is a dynamic settings dictionary; the cast keeps
    // the chained `.cas` accesses typed instead of narrowing to `never`.
    if (!(Meteor.settings.public as { [key: string]: any }) &&
        !Meteor.settings.public.cas &&
        !Meteor.settings.public.cas.loginUrl) {
        return;
    }

    var settings = Meteor.settings.public.cas;

    var backURL = window.location.href.replace('#', '');
    if (options != null && options.redirectUrl != null)
        backURL = options.redirectUrl;

    var serviceURL = addParameterToURL(backURL, 'casToken='+credentialToken);

    var loginUrl = settings.loginUrl +
        "?" + (settings.serviceParam || "service") + "=" +
        encodeURIComponent(serviceURL)

    if (settings.popup == false) {
      // lib.dom types the `location` setter as `Location | (string & Location)`;
      // assigning a plain URL string requires this assertion.
      window.location = loginUrl as string & Location;
      return;
    }

    var popup = openCenteredPopup(
        loginUrl,
        settings.width || 800,
        settings.height || 600
    );

    var checkPopupOpen = setInterval(function() {
        try {
	    if(popup && popup.document && popup.document.getElementById('popupCanBeClosed')) {
                popup.close();
      	    }
            // Fix for #328 - added a second test criteria (popup.closed === undefined)
            // to humour this Android quirk:
            // http://code.google.com/p/android/issues/detail?id=21061
            var popupClosed = popup!.closed || popup!.closed === undefined;
        } catch (e) {
            // For some unknown reason, IE9 (and others?) sometimes (when
            // the popup closes too quickly?) throws "SCRIPT16386: No such
            // interface supported" when trying to read 'popup.closed'. Try
            // again in 100ms.
            return;
        }

        if (popupClosed) {
            clearInterval(checkPopupOpen);

            // check auth on server.
            Accounts.callLoginMethod({
                methodArguments: [{ cas: { credentialToken: credentialToken } }],
                userCallback: err => {
                    // Fix redirect bug after login successfully
                    if (!err) {
                        window.location.href = '/';
                    }
                }
            });
        }
    }, 100);
};

var openCenteredPopup = function(url: string, width: number, height: number) {
  // #FIXME screenX and outerWidth are often different units on mobile screen or high DPI
    // see https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio
  var screenX = typeof window.screenX !== 'undefined'
  ? window.screenX : window.screenLeft;
  var screenY = typeof window.screenY !== 'undefined'
  ? window.screenY : window.screenTop;
  var outerWidth = typeof window.outerWidth !== 'undefined'
  ? window.outerWidth : document.body.clientWidth;
  var outerHeight = typeof window.outerHeight !== 'undefined'
  ? window.outerHeight : (document.body.clientHeight - 22);
  // XXX what is the 22?

  // Use `outerWidth - width` and `outerHeight - height` for help in
  // positioning the popup centered relative to the current window
  var left = screenX + (outerWidth - width) / 2;
  var top = screenY + (outerHeight - height) / 2;
  var features = ('width=' + width + ',height=' + height +
      ',left=' + left + ',top=' + top + ',scrollbars=yes');

  var newwindow = window.open(url, '_blank', features);
  if (newwindow!.focus != null)
    newwindow!.focus();
  return newwindow;
};

interface LoginWithCasOptions {
  redirectUrl?: string;
}
