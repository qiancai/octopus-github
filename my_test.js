// ==UserScript==
// @name         Octopus GitHub
// @version      0.5
// @description  A userscript for GitHub
// @author       Oreo
// @homepage     https://github.com/Oreoxmt/octopus-github
// @updateURL    https://github.com/Oreoxmt/octopus-github/raw/main/gh-util.user.js
// @downloadURL  https://github.com/Oreoxmt/octopus-github/raw/main/gh-util.user.js
// @supportURL   https://github.com/Oreoxmt/octopus-github
// @match        https://github.com/*/pulls*
// @match        https://github.com/*/pull/*
// @grant        none
// @run-at       document-start
// @require      https://cdnjs.cloudflare.com/ajax/libs/rest.js/15.2.6/octokit-rest.js
// ==/UserScript==

(function () {

    'use strict';

    const ATTR = 'octopus-github-util-mark'
    const STORAGEKEY = 'octopus-github-util:token'

    function GetRepositoryInformation() {
        // Get the pathname of the current page
        var pathname = location.pathname;

        // Split the pathname into an array of parts
        var parts = pathname.split('/');

        // Return an object containing the user name and repository name
        return {
            owner: parts[1],
            name: parts[2],
        }
    }

    function EnsureToken() {
        var token = localStorage.getItem(STORAGEKEY)
        if (!token) {
            // Prompt user to set token
            // TODO: Use HTML element instead of prompt
            token = prompt('Enter your GitHub token:');
            if (!token) {
                throw 'No token set'
            }
            localStorage.setItem(STORAGEKEY, token);
        }
        return token;
    }

    // This function can be used to leave a comment on a specific PR
    function LeaveCommentOnPR(commentLink, comment) {
        // Send the POST request to the GitHub API
        // TODO: Use Octokit to create requests
        fetch(commentLink, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${EnsureToken()}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                'body': comment
            })
        }).then((response) => {
            console.log('response to ', commentLink, response)
        }).catch((error) => {
            console.log('error on ', commentLink, error)
        })
    }

    // TODO: Use toggle instead of button, and add more features to the toggle, e.g., editing tokens.
    function EnsureCommentButton() {
        const MARK = 'comment-button'
        if (document.querySelector(`button[${ATTR}="${MARK}"]`)) {
            return;
        }
        // First, find the "table-list-header-toggle" div
        var toggleDiv = document.querySelector('.table-list-header-toggle.float-right');

        if (!toggleDiv) {
            return;
        }
        // Next, create a button element and add it to the page
        var button = document.createElement('button');
        button.innerHTML = 'Comment';
        button.setAttribute('class', 'btn btn-sm js-details-target d-inline-block float-left float-none m-0 mr-md-0 js-title-edit-button');
        button.setAttribute(ATTR, MARK);
        toggleDiv.appendChild(button);

        // Next, add an event listener to the button to listen for clicks
        button.addEventListener('click', function () {
            EnsureToken();

            // Get a list of all the checkboxes on the page (these are used to select PRs)
            var checkboxes = document.querySelectorAll('input[type=checkbox][data-check-all-item]');

            // Iterate through the checkboxes and get the ones that are checked
            var selectedPRs = [];

            checkboxes.forEach(function (checkbox) {
                if (checkbox.checked) {
                    selectedPRs.push(checkbox.value);
                }
            })

            // Prompt the user for a comment to leave on the selected PRs
            var comment = prompt('Enter a comment to leave on the selected PRs:');
            if (!comment) {
                return;
            }
            var repo = GetRepositoryInformation();

            // Leave the comment on each selected PR
            selectedPRs.forEach(function (pr) {
                var commentLink = `https://api.github.com/repos/${repo.owner}/${repo.name}/issues/${pr}/comments`;
                // Leave a comment on the PR
                LeaveCommentOnPR(commentLink, comment);
            });
        });
    }

    function EnsureCommentButtonOnPR() {
        const MARK = "comment-button-pr";
        if (document.querySelector(`button[${ATTR}="${MARK}"]`)) {
            return;
        }
        // First, find the "table-list-header-toggle" div
        var headerActions = document.querySelector(".gh-header-actions");

        if (!headerActions) {
            return;
        }

        // Next, create a button element and add it to the page
        var button = document.createElement("button");
        button.innerHTML = "Comment";
        button.setAttribute(
            "class",
            "flex-md-order-2 Button--secondary Button--small Button m-0 mr-md-0"
        );
        button.setAttribute(ATTR, MARK);
        headerActions.appendChild(button);

        // Next, add an event listener to the button to listen for clicks
        button.addEventListener("click", function () {
            EnsureToken();

            // get the pr number
            const url = window.location.pathname;
            const urlSplit = url.split("/");
            const index = urlSplit.indexOf("pull");
            const pr = urlSplit[index + 1];

            // Prompt the user for a comment to leave on the selected PRs
            var comment = prompt("Enter a comment to leave on the selected PRs:");
            if (!comment) {
              return;
            }
            var repo = GetRepositoryInformation();

            // Leave the comment on this PR
            var commentLink = `https://api.github.com/repos/${repo.owner}/${repo.name}/issues/${pr}/comments`;
            LeaveCommentOnPR(commentLink, comment);
        });
    }

    function EnsureFileLink(issueElement) {
        const MARK = 'file-link-span'

        if (issueElement.querySelector(`span[${ATTR}="${MARK}"]`)) {
            return; // Already added
        }

        var issueId = issueElement.getAttribute("id")
        var originalLinkElement = document.getElementById(issueId + "_link")
        if (!originalLinkElement) {
            return; // Element is not ready
        }

        var originalLink = originalLinkElement.getAttribute("href")
        var newLink = originalLink + "/files"

        var openedByElement = issueElement.querySelectorAll('span[class="opened-by"]');
        if (openedByElement.length == 1) {
            var openedBy = openedByElement[0];
            var linkSpanElement = document.createElement('span');
            linkSpanElement.setAttribute('class', 'd-inline-block mr-1 custom')
            linkSpanElement.setAttribute(ATTR, MARK)
            var dotSpanElement = document.createElement('span');
            dotSpanElement.innerHTML = ' • ';
            dotSpanElement.setAttribute('class', 'd-inline-block mr-1 custom')
            var linkElement = document.createElement('a')
            linkElement.setAttribute('href', newLink)
            linkElement.setAttribute('class', 'Link--muted')
            linkElement.innerHTML = "Files"
            linkSpanElement.appendChild(linkElement)
            openedBy.insertAdjacentElement('beforebegin', linkSpanElement)
            openedBy.insertAdjacentElement('beforebegin', dotSpanElement);
        }
    }

    // This function creates a button that scrolls to top of the page
    function EnsureScrollToTopButton() {
        const MARK = 'scroll-to-top-button';

        if (document.querySelector(`button[${ATTR}="${MARK}"]`)) {
            return;
        }

        // create the button
        var button = document.createElement('button');
        button.innerHTML = '&uarr;';

        // set position and style for the button
        button.style.position = "fixed";
        button.style.bottom = "55px";
        button.style.right = "20px";
        button.style.zIndex = "999"; // always on top
        button.style.width = "30px";
        button.style.display = "none"; // initially hidden
        button.className = "js-details-target js-title-edit-button flex-md-order-2 Button--secondary Button--small Button m-0 mr-md-0";

        // trigger scrolling to top when button is clicked
        button.addEventListener('click', function () {
            window.scrollTo(0, 0);
        });

        // add the button to the page
        document.body.appendChild(button);

        // show the button only when not at the top
        window.addEventListener("scroll", function() {
            if (window.pageYOffset > 0) {
              button.style.display = "block";
            } else {
              button.style.display = "none";
            }
          });
    }

    // This function creates a button that scrolls to bottom of the page
    function EnsureScrollToBottomButton() {
        const MARK = 'scroll-to-bottom-button';

        if (document.querySelector(`button[${ATTR}="${MARK}"]`)) {
          return;
        }

        // create the button
        var button = document.createElement('button');
        button.innerHTML = '&darr;';

        // set position and style for the button
        button.style.position = "fixed";
        button.style.bottom = "20px";
        button.style.right = "20px";
        button.style.zIndex = "999"; // always on top
        button.style.width = "30px";
        button.className = "js-details-target js-title-edit-button flex-md-order-2 Button--secondary Button--small Button m-0 mr-md-0";

        // trigger scrolling to bottom when button is clicked
        button.addEventListener('click', function () {
          window.scrollTo(0, document.body.scrollHeight);
        });

        // add the button to the page
        document.body.appendChild(button);

        // show the button only when not at the bottom
        window.addEventListener("scroll", function() {
          if (window.pageYOffset + window.innerHeight < document.body.scrollHeight) {
            button.style.display = "block";
          } else {
            button.style.display = "none";
          }
        });
      }

    async function get_my_github_id() {
        try {
            const userURL = 'https://api.github.com/user';
            const response = await fetch(userURL, {
                headers: {'Authorization': `Bearer ${EnsureToken()}`,},
            });

            if (response.ok) {
                const userData = await response.json();
                return userData.login;
            } else {
                throw new Error('Failed to fetch current user login.');
            }
        } catch (error) {
            console.error('An error occurred:', error);
            throw error;
        }
    }

    function get_pr_info(octokit, pr_url) {
        return new Promise((resolve, reject) => {
            const url_parts = pr_url.split('/');
            const source_repo_owner = url_parts[3];
            const source_repo_name = url_parts[4];
            const pr_number = url_parts[6];

            octokit.pullRequests.get({
                owner: source_repo_owner,
                repo: source_repo_name,
                number: pr_number,
            })
                .then(response => {
                const pr_data = response.data;

                const source_title = pr_data.title;
                const source_description = pr_data.body;
                const exclude_labels = ["size", "translation", "status", "first-time-contributor", "contribution"];
                const source_labels = pr_data.labels
                .filter(label => !exclude_labels.some(exclude_label => label.name.includes(exclude_label)))
                .map(label => label.name);
                const base_repo = pr_data.base.repo.full_name;
                const base_branch = pr_data.base.ref;
                const head_repo = pr_data.head.repo.full_name;
                const head_branch = pr_data.head.ref;

                console.log(`Getting source language PR information was successful. The head branch name is: ${head_branch}`);

                const result = [source_title, source_description, source_labels, base_repo, base_branch, head_repo, head_branch, pr_number];
                resolve(result);
            })
                .catch(error => {
                console.log(`Failed to get source language PR information: ${error.message}`);
                reject(error);
            });
        });
    }

     async function sync_my_repo_branch(octokit, target_repo_owner, target_repo_name, my_repo_owner, my_repo_name, base_branch) {
         try {
             const upstreamRef = await octokit.gitdata.getReference({
                 owner: target_repo_owner,
                 repo: target_repo_name,
                 ref: `heads/${base_branch}`
             });

             const upstream_sha = upstreamRef.data.object.sha;
             console.log(upstream_sha);

             console.log("Syncing the latest content from the upstream branch...");
             await octokit.gitdata.updateReference({
                 owner: my_repo_owner,
                 repo: my_repo_name,
                 ref: `heads/${base_branch}`,
                 sha: upstream_sha,
                 force: true,
                 headers: {
                     'Authorization': `Bearer ${EnsureToken()}`,
                 },
             });

             console.log("The content sync is successful!");
         } catch (error) {
             console.log("Failed to sync the latest content from the upstream branch.");
             console.log(error);
             throw error;
         }
    };

    async function test(octokit) {
        try {
            const source_pr_url = 'https://github.com/pingcap/docs-cn/pull/14089'
            const target_repo_owner = "pingcap";
            const my_repo_owner = await get_my_github_id();
            console.log(my_repo_owner);
            //const [source_title, source_description, source_labels, base_repo, base_branch, head_repo, head_branch, pr_number] = await get_pr_info(octokit, source_pr_url);
            //await sync_my_repo_branch(octokit, target_repo_owner, target_repo_name, my_repo_owner, my_repo_name, base_branch);
            //await sync_my_repo_branch(octokit, 'pingcap', 'docs', 'qiancai', 'docs', 'release-5.3');
        } catch (error) {
            console.error("An error occurred:", error);
        }
    }

    function Init() {

        const url = window.location.href;
        const octokit = new Octokit({ auth: EnsureToken() });
        console.log(octokit);
        console.log('test1');

        test(octokit)

        //octokit.users.getForUser({username: 'qiancai'}).then(({ data }) => {console.log(data);});

        // If we are on the PR list page, add the comment button and file link
        if (url.includes('/pulls')) {
            const observer = new MutationObserver(() => {
                document.querySelectorAll('div[id^="issue_"]').forEach((element) => {
                    EnsureFileLink(element);
                })
                EnsureCommentButton();
            });
            const config = { childList: true, subtree: true };
            observer.observe(document, config);
        }

        // If we are on the PR details page, add the scroll to top and bottom buttons
        if (url.includes('/pull/')) {
            EnsureScrollToTopButton();
            EnsureScrollToBottomButton();
            EnsureCommentButtonOnPR();

            const observer = new MutationObserver(() => {
                EnsureCommentButtonOnPR();
            });
            const targetNode = document.body;
            const observerOptions = { childList: true, subtree: true };
            observer.observe(targetNode, observerOptions);
        }
    }

    Init();
})();
