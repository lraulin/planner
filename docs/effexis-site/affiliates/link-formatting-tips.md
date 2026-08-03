---
source_url: "http://www.effexis.com/affiliates/link-formatting-tips.htm"
title: "Affiliate Link Formatting Tips"
scraped_at: 2026-08-03T15:15:05Z
---

# Affiliate Link Formatting Tips

_Archived from [http://www.effexis.com/affiliates/link-formatting-tips.htm](http://www.effexis.com/affiliates/link-formatting-tips.htm)_

---

Affiliate Link Formatting Tips This page describes how to set up your links to go through your domain rather than directly through 1ShoppingCart.
Instead of something like this as the link:
http://www.mcssl.com/app/aftrack.asp?afid=xxxxxx
You can have something like this instead:
http://www.yourdomain.com/go/ap.php
This has several advantages over the standard link:

- It looks nicer
- It's easier to change - If the 1ShoppingCart links ever change (or we switch to another affiliate program), you only have to change links in one place.
  To setup something like this, use the following PHP code in the link page (ap.php in the go directory):

<?php
header("Location: http://affiliateLinkURL");
?>
<html>
<body>
</body>
</html>
Your web host must support PHP, but this is widely supported by virtually every hosting company. Here you would just replace the 'affiliateLinkURL' with your true affiliate link.
Finally, you can use a service like [www.tinyurl.com](http://www.tinyurl.com) or [www.metamark.net](http://www.metamark.net) to create short URLs representing your affiliate links.
