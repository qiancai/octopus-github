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
                 headers: {'Authorization': `Bearer ${EnsureToken()}`}
             });

             console.log("The content sync is successful!");
         } catch (error) {
             console.log("Failed to sync the latest content from the upstream branch.");
             console.log(error);
             throw error;
         }
    };

    async function create_branch(octokit, repoOwner, repoName, branchName, baseBranch) {
        try {
            const baseRef = await octokit.gitdata.getReference({
                owner: repoOwner,
                repo: repoName,
                ref: `heads/${baseBranch}`
            });

            const baseSha = baseRef.data.object.sha;
            console.log(baseSha);

            await octokit.gitdata.createReference({
                owner: repoOwner,
                repo: repoName,
                ref: `refs/heads/${branchName}`,
                sha: baseSha,
                headers: {'Authorization': `Bearer ${EnsureToken()}`}
            });

            const branchUrl = `https://github.com/${repoOwner}/${repoName}/tree/${branchName}`;
            console.log(`A new branch is created successfully. The branch address is: ${branchUrl}`);

        } catch (error) {
            console.log("Failed to create the branch.");
            console.error(error);
            throw error;
        }
    }

    async function create_file_in_branch(octokit, repoOwner, repoName, branchName, filePath, fileContent, commitMessage) {
        try {
            const contentBase64 = btoa(fileContent);
            const response = await octokit.repos.createFile({
                owner: repoOwner,
                repo: repoName,
                branch: branchName,
                path: filePath,
                message: commitMessage,
                content: contentBase64,
                headers: {'Authorization': `Bearer ${EnsureToken()}`}
            });

            console.log('A temp file is created successfully!');

        } catch (error) {
            console.log('Failed to create the temp file.');
            console.error(error);
        }
    }

    // For changing the description of the translation PR
    function update_pr_description(source_pr_url, source_description,base_repo, target_repo_name) {
        const source_pr_CLA = "https://cla-assistant.io/pingcap/" + base_repo;
        const new_pr_CLA = "https://cla-assistant.io/pingcap/" + target_repo_name;
        let new_pr_description = source_description.replace(source_pr_CLA, new_pr_CLA);

        new_pr_description = new_pr_description.replace("This PR is translated from:", "This PR is translated from: " + source_pr_url);

        if (source_description.includes("tips for choosing the affected versions")) {
            new_pr_description = new_pr_description.replace(/.*?\[tips for choosing the affected version.*?\n\n?/, "");
        }

        return new_pr_description;
    }

    async function create_pull_request(octokit, targetRepoOwner, targetRepoName, baseBranch, myRepoOwner, myRepoName, newBranchName, title, body, labels) {
        try {
            const prResponse = await octokit.pullRequests.create({
                owner: targetRepoOwner,
                repo: targetRepoName,
                title: title,
                body: body,
                head: `${myRepoOwner}:${newBranchName}`,
                base: baseBranch,
                headers: {'Authorization': `Bearer ${EnsureToken()}`}
            });

            console.log('Pull Request created successfully!');
            console.log(prResponse);
            const prUrl = prResponse.data.html_url;
            console.log(`Your target PR is created successfully. The PR address is: ${prUrl}`);
            const urlParts = prUrl.split("/");
            const prNumber = urlParts[6];

            // Add labels to the created PR
            const labelsResponse = await octokit.issues.addLabels({
                owner: targetRepoOwner,
                repo: targetRepoName,
                number: prNumber,
                labels: labels,
                headers: {'Authorization': `Bearer ${EnsureToken()}`}
            });

            console.log('Labels are added successfully.');
            return prUrl;

/*             if (labelsResponse.status === 200) {
                console.log('Labels are added successfully.');
            } else {
                console.log('Failed to add labels.');
            }
            } else {
                console.log('Failed to create the target PR:', prResponse.statusText);
                throw new Error('Failed to create the target PR: ' + prResponse.statusText);
            } */
        } catch (error) {
            console.log('Failed to create the target PR.');
            console.error(error);
        }
    }

    async function delete_file_in_branch(octokit, repoOwner, repoName, branchName, filePath, commitMessage) {
        try {
            const { data: fileInfo } = await octokit.repos.getContent({
                owner: repoOwner,
                repo: repoName,
                path: filePath,
                ref: branchName
            });

            await octokit.repos.deleteFile({
                owner: repoOwner,
                repo: repoName,
                path: filePath,
                message: commitMessage,
                sha: fileInfo.sha,
                branch: branchName,
                headers: {'Authorization': `Bearer ${EnsureToken()}`}
            });

            console.log("The temp.md is deleted successfully!");
        } catch (error) {
            console.log(`Failed to delete temp.md. Error message: ${error.message}`);
            throw error;
        }
    }

    async function CreateTransPR() {
        try {

            // Create a message box element
            const messageBox = document.createElement("div");
            messageBox.style.position = "fixed";
            messageBox.style.top = "50%";
            messageBox.style.left = "50%";
            messageBox.style.transform = "translate(-50%, -50%)";
            messageBox.style.padding = "30px";
            messageBox.style.backgroundColor = "white";
            messageBox.style.border = "1px solid #e1e4e8";
            messageBox.style.borderRadius = "6px";
            messageBox.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.1)";
            messageBox.style.zIndex = "9999";
            messageBox.style.width = "400px";
            document.body.appendChild(messageBox);

            // Create the message text element
            const messageTextElement = document.createElement("span");
            messageTextElement.innerHTML = "Start creating an empty translation PR for you. <br> Wait for a few seconds....";
            messageTextElement.style.fontSize = "14px";
            messageTextElement.style.color = "#24292e";
            messageTextElement.style.marginBottom = "10px";
            messageBox.appendChild(messageTextElement);

            // Create the close button
            const closeButton = document.createElement("span");
            closeButton.innerText = "X";
            closeButton.style.position = "absolute";
            closeButton.style.top = "8px";
            closeButton.style.right = "10px";
            closeButton.style.right = "8px";
            closeButton.style.fontSize = "12px";
            closeButton.style.fontWeight = "bold";
            closeButton.style.color = "#586069";
            closeButton.style.border = "none";
            closeButton.style.backgroundColor = "transparent";
            closeButton.style.cursor = "pointer";
            closeButton.addEventListener("click", () => {
                messageBox.style.display = "none";
            });
            messageBox.appendChild(closeButton);

            // Show the message box
            messageBox.style.display = "block";


            const octokit = new Octokit({ auth: EnsureToken() });
            console.log(octokit);
            const source_pr_url = window.location.href;
            const target_repo_owner = "pingcap";

            let my_repo_name, target_repo_name, translation_label;

            if (source_pr_url.includes("pingcap/docs-cn/pull")) {
                my_repo_name = "docs";
                target_repo_name = "docs";
                translation_label = "translation/from-docs-cn";
            } else if (source_pr_url.includes("pingcap/docs/pull")) {
                target_repo_name = "docs-cn";
                my_repo_name = "docs-cn";
                translation_label = "translation/from-docs";
            } else {
                console.log("The provided URL is not a pull request of pingcap/docs-cn or pingcap/docs.");
                console.log("Exiting the program...");
                return;
            }
            const my_repo_owner = await get_my_github_id();
            //console.log(my_repo_owner);
            const [source_title, source_description, source_labels, base_repo, base_branch, head_repo, head_branch, pr_number] = await get_pr_info(octokit, source_pr_url);
            await sync_my_repo_branch(octokit, target_repo_owner, target_repo_name, my_repo_owner, my_repo_name, base_branch);
            //#await sync_my_repo_branch(octokit, 'pingcap', 'docs', 'qiancai', 'docs', 'master');
                  // Step 3. Create a new branch in the repository that I forked
            const new_branch_name = `test-${head_branch}-${pr_number}`;
            await create_branch(octokit, my_repo_owner, my_repo_name, new_branch_name, base_branch);
            //#await create_branch(octokit, 'qiancai', 'docs', 'test060128', 'master');
                  // Step 4. Create a temporary temp.md file in the new branch
            const file_path = "temp.md";
            const file_content = "This is a test file.";
            const commit_message = "Add temp.md";
            await create_file_in_branch(octokit, my_repo_owner, my_repo_name, new_branch_name, file_path, file_content, commit_message);
            //#await create_file_in_branch(octokit, 'qiancai', 'docs', 'test060128', file_path, file_content, commit_message);
                  // Step 5. Create a pull request
            const title = source_title;
            const body = update_pr_description(source_pr_url, source_description, base_repo, target_repo_name);
            //#const body = "This is test PR.";
            const labels = source_labels;
            const target_pr_url = await create_pull_request(octokit, target_repo_owner, target_repo_name, base_branch, my_repo_owner, my_repo_name, new_branch_name, title, body, labels);
            //@await target_pr_url = create_pull_request(octokit, target_repo_owner, target_repo_name, base_branch, my_repo_owner, my_repo_name, new_branch_name, title, body, labels);
                  // Step 6. Delete the temporary temp.md file
            const commit_message2 = "Delete temp.md";
            await delete_file_in_branch(octokit, my_repo_owner, my_repo_name, new_branch_name, file_path, commit_message2);
            //#await delete_file_in_branch(octokit, 'qiancai', 'docs', 'tidb-roadmap-13942', file_path, commit_message2);

            // Update message text after function 3 execution
            messageTextElement.innerHTML = `Your target PR is created successfully. <br> The PR address is:<br> <a href="${target_pr_url}" target="_blank">${target_pr_url}</a>`;
            //messageTextElement.innerHTML = `Your target PR is created successfully. <br> The PR address is:<br> ${source_pr_url}`;
        } catch (error) {
            console.error("An error occurred:", error);
            return error;
        }
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

      function EnsureCreateTransPRButtonOnPR() {
        const MARK = 'create-trans-pr-button';

        // Check if the button already exists
        if (document.querySelector(`button[${ATTR}="${MARK}"]`)) {
          return;
        }

        // Find the header actions container
        var headerActions = document.querySelector(".gh-header-actions");

        if (!headerActions) {
          return;
        }

        // Create a button element
        var button = document.createElement("button");
        button.innerHTML = "Create Translation PR";
        button.setAttribute(
          "class",
          "flex-md-order-2 Button--secondary Button--small Button m-0 mr-md-0"
        );
        button.setAttribute(ATTR, MARK);
        headerActions.appendChild(button);

        // Add event listener to the button
        button.addEventListener("click", function () {
          // Call the function to create translation PR
          EnsureToken();
          CreateTransPR();
        });
      }

    function Init() {

        const url = window.location.href;

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


        // If we are on the PR details page of pingcap/docs-cn or pingcap/docs, add the buttons
        if (url.includes('pingcap/docs-cn/pull') || url.includes('pingcap/docs/pull')) {
            EnsureCreateTransPRButtonOnPR();
            EnsureScrollToTopButton();
            EnsureScrollToBottomButton();
            EnsureCommentButtonOnPR();


            const observer = new MutationObserver(() => {
                EnsureCommentButtonOnPR();
                EnsureCreateTransPRButtonOnPR()
            });
            const targetNode = document.body;
            const observerOptions = { childList: true, subtree: true };
            observer.observe(targetNode, observerOptions);
            // If we are on the PR details page of other repos, add the scroll to top and bottom buttons
       } else if (url.includes('/pull/')) {
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

