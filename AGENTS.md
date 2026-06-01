# Agent Notes

When changing Redmine page behavior, check the relevant Redmine source before
choosing DOM selectors. Prefer verifying the upstream view/helper that renders
the field, link, or button instead of guessing from Rails conventions or nearby
markup.

Redmine source code: https://github.com/redmine/redmine

For issue edit page fields, start with Redmine's issue views, such as:

- `app/views/issues/_attributes.html.erb`
  (https://github.com/redmine/redmine/blob/master/app/views/issues/_attributes.html.erb)
- `app/views/issues/_form.html.erb`
  (https://github.com/redmine/redmine/blob/master/app/views/issues/_form.html.erb)
- related helpers that define the form builder or JavaScript behavior

Use selectors that are backed by the rendered Redmine source, and note the
source file when the selector is not obvious.
